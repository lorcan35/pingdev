// @pingdev/std — Universal LLM caller module
// Re-uses the fetch-based OpenAI-compatible pattern from self-heal.ts.

import { logGateway, serializeError } from './gw-log.js';
import type { LLMConfig } from './self-heal.js';
import { DEFAULT_SELF_HEAL_CONFIG } from './self-heal.js';

export interface CallLLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface SuggestResult {
  suggestion: string;
  confidence: number;
}

/** Build an LLMConfig from environment variables, falling back to self-heal defaults. */
export function getLLMConfig(): LLMConfig {
  const defaults = DEFAULT_SELF_HEAL_CONFIG.llm;
  return {
    provider: 'openai-compat',
    baseUrl: process.env.PINGOS_LLM_BASE_URL || defaults.baseUrl,
    apiKey: process.env.PINGOS_LLM_API_KEY || defaults.apiKey,
    model: process.env.PINGOS_LLM_MODEL || defaults.model,
    maxTokens: defaults.maxTokens,
    temperature: defaults.temperature,
    timeoutMs: defaults.timeoutMs,
  };
}

/** Call an OpenAI-compatible LLM and return the assistant's text response. */
export async function callLLM(prompt: string, opts?: CallLLMOptions): Promise<string> {
  const cfg = getLLMConfig();
  const model = opts?.model ?? cfg.model;
  const maxTokens = opts?.maxTokens ?? cfg.maxTokens ?? 500;
  const temperature = opts?.temperature ?? cfg.temperature ?? 0.2;
  const timeoutMs = cfg.timeoutMs ?? 15_000;

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
    };

    logGateway('[llm] callLLM', { model, promptLength: prompt.length });

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
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    logGateway('[llm] response missing content', { data });
    throw new Error('LLM response missing content');
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      logGateway('[llm] request timeout', { timeoutMs });
      throw new Error(`LLM request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Generate a contextual suggestion for a device interaction. */
export async function suggest(
  deviceId: string,
  context: string,
  question: string,
): Promise<SuggestResult> {
  const systemPrompt = `You are a helpful assistant for PingOS, a browser automation platform. You provide concise, actionable suggestions based on the current page context and user question. Always respond with a JSON object: {"suggestion": "your suggestion text", "confidence": 0.0-1.0}`;

  const prompt = `Device: ${deviceId}
Page context: ${context}
User question: ${question}

Provide a concise suggestion.`;

  const text = await callLLM(prompt, {
    systemPrompt,
    maxTokens: 300,
    temperature: 0.3,
  });

  // Parse JSON response
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed.suggestion === 'string') {
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    return { suggestion: parsed.suggestion, confidence };
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
  const cfg = getLLMConfig();
  // For vision, prefer a vision-capable model
  const model = opts?.model ?? 'anthropic/claude-sonnet-4';
  const maxTokens = opts?.maxTokens ?? cfg.maxTokens ?? 1000;
  const temperature = opts?.temperature ?? cfg.temperature ?? 0.2;
  const timeoutMs = cfg.timeoutMs ?? 30_000; // longer timeout for vision

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
    };

    logGateway('[llm] callLLMVision', { model, promptLength: prompt.length, imageCount: opts?.images?.length ?? 0 });

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
    const responseContent = data?.choices?.[0]?.message?.content;

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

function tryParseJson(text: string): any {
  const t = (text ?? '').trim();
  if (!t) return null;

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : t;

  try {
    return JSON.parse(candidate);
  } catch {
    // continue
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
      // ignore
    }
  }

  return null;
}
