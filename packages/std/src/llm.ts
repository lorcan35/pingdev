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
