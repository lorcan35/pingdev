// @pingdev/std — Universal LLM caller module
// Re-uses the fetch-based OpenAI-compatible pattern from self-heal.ts.

import { logGateway } from './gw-log.js';
import type { LLMConfig } from './self-heal.js';
import { DEFAULT_SELF_HEAL_CONFIG } from './self-heal.js';
import {
  getLocalConfig,
  getModelForFeature,
  getTimeoutForFeature,
  isLocalMode,
  truncateDom,
} from './local-mode.js';
import { getSuggestPrompt } from './local-prompts.js';
import { extractJsonFromText, repairLLMJson, stripCodeFences } from './json-repair.js';

export interface CallLLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  responseFormatJson?: boolean;
  feature?: string;
}

export interface SuggestResult {
  suggestion: string;
  confidence: number;
}

// Strip <think> blocks from local model responses
function stripThinkBlocks(text: string): string {
  // Remove full reasoning blocks.
  let cleaned = String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Handle unclosed tags and orphan tag tokens.
  cleaned = cleaned
    .replace(/^\s*<think>[\s\S]*$/gi, '')
    .replace(/^\s*<thinking>[\s\S]*$/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .trim();

  return cleaned;
}

function stripControlChars(text: string): string {
  // Preserve \t, \n, \r but remove other control chars that frequently break JSON serialization.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function extractJSON(text: string): string {
  const noThink = stripThinkBlocks(String(text ?? ''));
  const noFence = stripCodeFences(noThink);
  const extracted = extractJsonFromText(noFence);

  if (extracted) return stripControlChars(extracted).trim();

  const firstObj = noFence.indexOf('{');
  const firstArr = noFence.indexOf('[');
  const firstCandidates = [firstObj, firstArr].filter((n) => n >= 0);
  if (firstCandidates.length === 0) {
    return stripControlChars(noFence).trim();
  }
  const first = Math.min(...firstCandidates);

  const lastObj = noFence.lastIndexOf('}');
  const lastArr = noFence.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last < first) {
    return stripControlChars(noFence.slice(first)).trim();
  }
  return stripControlChars(noFence.slice(first, last + 1)).trim();
}

function looksLikeJsonContamination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  if (/```(?:json)?/i.test(trimmed)) return true;
  return /[\[{][\s\S]*[\]}]/.test(trimmed);
}

function cleanLLMText(raw: string, expectJson = false): string {
  const base = stripControlChars(stripThinkBlocks(String(raw ?? ''))).trim();
  if (!base) return base;

  if (!expectJson && !looksLikeJsonContamination(base)) {
    return base;
  }

  const extracted = extractJSON(base);
  if (!extracted) return base;

  try {
    JSON.parse(extracted);
    return extracted;
  } catch {
    try {
      return JSON.stringify(repairLLMJson(extracted));
    } catch {
      try {
        return JSON.stringify(repairLLMJson(base));
      } catch {
        return extracted;
      }
    }
  }
}

function isPlaceholderString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '...' || normalized === 'example' || normalized === 'string';
}

function hasPlaceholderValues(value: unknown): boolean {
  if (typeof value === 'string') return isPlaceholderString(value);
  if (Array.isArray(value)) return value.some((item) => hasPlaceholderValues(item));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => hasPlaceholderValues(item));
  }
  return false;
}

function hasDegenerateJsonPlaceholders(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return hasPlaceholderValues(parsed);
  } catch {
    try {
      const repaired = repairLLMJson(text);
      return hasPlaceholderValues(repaired);
    } catch {
      return false;
    }
  }
}

/** Build an LLMConfig from environment variables, falling back to self-heal defaults. */
export function getLLMConfig(feature?: string): LLMConfig {
  const defaults = DEFAULT_SELF_HEAL_CONFIG.llm;
  const local = isLocalMode();
  const localCfg = getLocalConfig();

  const timeoutFromEnv = process.env.PINGOS_LLM_TIMEOUT_MS
    ? Number.parseInt(process.env.PINGOS_LLM_TIMEOUT_MS, 10)
    : NaN;

  const fallbackTimeout = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? timeoutFromEnv
    : defaults.timeoutMs;

  const modelFromFeature = feature ? getModelForFeature(feature) : '';

  return {
    provider: 'openai-compat',
    baseUrl: local ? localCfg.llmBaseUrl : (process.env.PINGOS_LLM_BASE_URL || defaults.baseUrl),
    apiKey: local ? localCfg.llmApiKey : (process.env.PINGOS_LLM_API_KEY || defaults.apiKey),
    model: local
      ? (modelFromFeature || localCfg.llmModel || defaults.model)
      : (process.env.PINGOS_LLM_MODEL || defaults.model),
    maxTokens: defaults.maxTokens,
    temperature: defaults.temperature,
    timeoutMs: local
      ? getTimeoutForFeature(feature ?? 'default')
      : fallbackTimeout,
  };
}

/** Call an OpenAI-compatible LLM and return the assistant's text response. */
export async function callLLM(prompt: string, opts?: CallLLMOptions): Promise<string> {
  const feature = opts?.feature ?? 'default';
  const cfg = getLLMConfig(feature);
  const local = isLocalMode();
  const localCfg = getLocalConfig();

  const routedModel = local ? getModelForFeature(feature) : cfg.model;
  const model = opts?.model ?? routedModel ?? cfg.model;
  const maxTokens = opts?.maxTokens ?? cfg.maxTokens ?? 500;
  const temperature = opts?.temperature ?? cfg.temperature ?? 0.2;
  const timeoutMs = opts?.timeoutMs ?? (local ? getTimeoutForFeature(feature) : (cfg.timeoutMs ?? 15_000));
  const responseFormatJson = opts?.responseFormatJson ?? (local && localCfg.responseFormat);

  const url = `${cfg.baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (opts?.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      // Local models (LM Studio) may reject response_format: json_object — rely on prompt instructions instead
      ...(responseFormatJson && !local ? { response_format: { type: 'json_object' as const } } : {}),
    };

    logGateway('[llm] callLLM', { model, feature, promptLength: prompt.length, timeoutMs, local });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logGateway('[llm] request failed', { status: res.status, statusText: res.statusText, body: text.slice(0, 200) });
      throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    let content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      content = cleanLLMText(content, responseFormatJson);
    }
    const shouldRetryDegenerateJson = responseFormatJson && local
      && typeof content === 'string'
      && hasDegenerateJsonPlaceholders(content);

    if (shouldRetryDegenerateJson) {
      const retryBody = {
        model,
        messages: [
          ...messages,
          {
            role: 'user',
            content: `You returned placeholder values. Replace ALL "..." and placeholder labels with real concrete content. Return valid JSON only.`,
          },
        ],
        temperature,
        max_tokens: maxTokens,
      };
      const retryRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryBody),
        signal: controller.signal,
      });
      if (retryRes.ok) {
        const retryData: any = await retryRes.json();
        const retryText = retryData?.choices?.[0]?.message?.content;
        if (typeof retryText === 'string') {
          content = cleanLLMText(retryText, true);
        }
      }
    }

    if (typeof content === 'string') {
      return content;
    }

    logGateway('[llm] response missing content', { data });
    throw new Error('LLM response missing content');
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      logGateway('[llm] request timeout', { timeoutMs, feature });
      throw new Error(`LLM request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function applyTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value ?? '')),
    template,
  );
}

/** Generate a contextual suggestion for a device interaction. */
export async function suggest(
  deviceId: string,
  context: string,
  question: string,
): Promise<SuggestResult> {
  const local = isLocalMode();
  const localCfg = getLocalConfig();
  const promptDef = getSuggestPrompt(local);

  const contextMaxChars = Number.parseInt(process.env.PINGOS_LLM_CONTEXT_MAX_CHARS || '', 10);
  const maxChars = Number.isFinite(contextMaxChars) && contextMaxChars > 0
    ? contextMaxChars
    : (local ? localCfg.domLimit : 5_000);

  const prompt = applyTemplate(promptDef.userTemplate, {
    deviceId,
    context: truncateDom(context ?? '', maxChars),
    question,
  });

  const text = await callLLM(prompt, {
    systemPrompt: promptDef.system || undefined,
    feature: 'suggest',
    maxTokens: 300,
    temperature: 0.3,
    responseFormatJson: true,
  });

  try {
    const parsed = repairLLMJson(text);
    if (parsed && typeof parsed === 'object' && typeof parsed.suggestion === 'string') {
      const conf = typeof (parsed as Record<string, unknown>).confidence === 'number'
        ? (parsed as Record<string, number>).confidence
        : Number((parsed as Record<string, unknown>).confidence);
      const confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5;
      return { suggestion: parsed.suggestion, confidence };
    }
  } catch {
    // fallback below
  }

  // Fallback: treat the entire response as the suggestion
  return { suggestion: text.trim(), confidence: 0.5 };
}

/* ─── Vision support ─── */

export interface VisionContent {
  type: 'image_url';
  image_url: {
    url: string; // data:image/png;base64,... or https://...
  };
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type MessageContent = string | Array<TextContent | VisionContent>;

export interface CallLLMVisionOptions extends CallLLMOptions {
  images?: string[]; // base64 data URLs or HTTP URLs
}

/** Call an OpenAI-compatible LLM with optional vision (image) content. */
export async function callLLMVision(prompt: string, opts?: CallLLMVisionOptions): Promise<string> {
  const local = isLocalMode();
  const localCfg = getLocalConfig();
  const cfg = getLLMConfig('visual');

  const baseUrl = local ? localCfg.visionBaseUrl : cfg.baseUrl;
  const model = opts?.model
    ?? (local ? getModelForFeature('vision') : undefined)
    ?? process.env.PINGOS_LLM_VISUAL_MODEL
    ?? cfg.model;
  const maxTokens = opts?.maxTokens ?? cfg.maxTokens ?? 1000;
  const temperature = opts?.temperature ?? cfg.temperature ?? 0.2;
  const timeoutMs = opts?.timeoutMs
    ?? (local ? getTimeoutForFeature('visual') : undefined)
    ?? parsePositiveIntEnv('PINGOS_LLM_VISUAL_TIMEOUT_MS')
    ?? cfg.timeoutMs
    ?? 30_000;
  const responseFormatJson = opts?.responseFormatJson ?? (local && localCfg.responseFormat);

  const url = `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    // Build content array with text and images
    const content: Array<TextContent | VisionContent> = [];

    // Add images first
    if (opts?.images) {
      for (const img of opts.images) {
        const imgUrl = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
        content.push({
          type: 'image_url',
          image_url: { url: imgUrl },
        });
      }
    }

    // Add text prompt
    content.push({ type: 'text', text: prompt });

    const messages: Array<{ role: string; content: MessageContent }> = [];
    if (opts?.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: content });

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      // Local models (LM Studio) may reject response_format: json_object — rely on prompt instructions instead
      ...(responseFormatJson && !local ? { response_format: { type: 'json_object' as const } } : {}),
    };

    logGateway('[llm] callLLMVision', { model, promptLength: prompt.length, imageCount: opts?.images?.length ?? 0, timeoutMs, local });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logGateway('[llm] vision request failed', { status: res.status, statusText: res.statusText, body: text.slice(0, 200) });
      throw new Error(`LLM vision request failed: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    let responseContent = data?.choices?.[0]?.message?.content;
    if (typeof responseContent === 'string') {
      responseContent = cleanLLMText(responseContent, responseFormatJson);
    }
    const shouldRetryDegenerateJson = responseFormatJson && local
      && typeof responseContent === 'string'
      && hasDegenerateJsonPlaceholders(responseContent);

    if (shouldRetryDegenerateJson) {
      const retryBody = {
        model,
        messages: [
          ...messages,
          {
            role: 'user',
            content: `You returned placeholder values. Replace ALL "..." and placeholder labels with real concrete content. Return valid JSON only.`,
          },
        ],
        temperature,
        max_tokens: maxTokens,
      };
      const retryRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryBody),
        signal: controller.signal,
      });
      if (retryRes.ok) {
        const retryData: any = await retryRes.json();
        const retryText = retryData?.choices?.[0]?.message?.content;
        if (typeof retryText === 'string') {
          responseContent = cleanLLMText(retryText, true);
        }
      }
    }

    if (typeof responseContent === 'string') {
      return responseContent;
    }

    logGateway('[llm] vision response missing content', { data });
    throw new Error('LLM vision response missing content');
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      logGateway('[llm] vision request timeout', { timeoutMs });
      throw new Error(`LLM vision request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
