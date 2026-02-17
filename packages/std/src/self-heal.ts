// @pingdev/std — JIT selector self-healing
// Attempts to repair broken CSS selectors using a DOM excerpt + an LLM.

import type { ExtensionBridge } from './ext-bridge.js';
import { logGateway, serializeError } from './gw-log.js';

export interface HealRequest {
  deviceId: string;
  op: string;
  selector: string;
  error: string;
  /** Optional URL of the page where the selector failed (best-effort). */
  url?: string;
  pageContext?: string;
}

export interface HealResult {
  newSelector: string;
  confidence: number;
  /** One-line explanation from the LLM (best-effort). */
  reasoning?: string;
}

export interface LLMConfig {
  provider: 'openai-compat';
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface SelfHealConfig {
  enabled: boolean;
  maxAttempts: number;
  domSnapshotMaxChars: number;
  minConfidence: number;
  llm: LLMConfig;
}

export const DEFAULT_SELF_HEAL_CONFIG: SelfHealConfig = {
  enabled: true,
  maxAttempts: 2,
  domSnapshotMaxChars: 15_000,
  minConfidence: 0.5,
  llm: {
    provider: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.PINGOS_LLM_API_KEY || '',
    model: 'meta-llama/llama-3.3-70b-instruct',
    maxTokens: 500,
    temperature: 0.2,
    timeoutMs: 15_000,
  },
};

let _extBridge: ExtensionBridge | null = null;
let _config: SelfHealConfig = { ...DEFAULT_SELF_HEAL_CONFIG };

export function configureSelfHeal(opts: {
  extBridge: ExtensionBridge;
  config?: Partial<SelfHealConfig>;
}): void {
  _extBridge = opts.extBridge;
  _config = {
    ...DEFAULT_SELF_HEAL_CONFIG,
    ...(opts.config ?? {}),
    llm: {
      ...DEFAULT_SELF_HEAL_CONFIG.llm,
      ...(opts.config?.llm ?? {}),
    },
  };
}

// Smart DOM extraction: aggressively clean HTML for small models
function extractSmartDOM(rawHTML: string, failedSelector: string, maxChars: number): string {
  let html = rawHTML;

  // 1. Strip noisy tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  // 2. Strip hash-like / generated class names
  //    - /^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/  (e.g. ab-12CD3)
  //    - /^css-/ (emotion)
  //    - /^sc-/  (styled-components)
  // Keep readable class names (semantic words)
  html = html.replace(/class="([^"]*)"/gi, (match, classes) => {
    const cleaned = (classes as string)
      .split(/\s+/)
      .filter((c) => {
        // Keep classes that look semantic (no random hashes)
        if (!c) return false;
        if (/^css-/i.test(c)) return false;
        if (/^sc-/i.test(c)) return false;
        if (/^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/.test(c)) return false;
        if (/^[a-z]{3,5}-[0-9a-f]{5,}$/i.test(c)) return false;
        if (/^[A-Z][a-zA-Z0-9_-]{6,}$/.test(c)) return false;
        return true;
      })
      .join(' ');
    return cleaned ? `class="${cleaned}"` : '';
  });

  // 3. Strip noisy attributes
  html = html.replace(/\s(?:style|onclick|onload|on\w+)="[^"]*"/gi, '');
  // Strip ALL data-* attributes except: data-testid, data-component-type, data-action
  html = html.replace(/\sdata-(?!(?:testid|component-type|action)\b)[\w-]+="[^"]*"/gi, '');

  // 4. Collapse whitespace
  html = html.replace(/\s+/g, ' ').trim();

  // 5. Truncate to maxChars
  if (html.length > maxChars) {
    html = html.slice(0, maxChars);
  }

  return html;
}

async function getDomExcerpt(
  deviceId: string,
  maxChars: number,
): Promise<{ url?: string; html: string }> {
  if (!_extBridge) return { html: '' };

  const expression = `(() => {
    const url = String(location.href || '');
    const root = document.querySelector('main') || document.body || document.documentElement;
    if (!root) return { url, html: '' };

    const clone = root.cloneNode(true);
    if (clone && clone.querySelectorAll) {
      clone.querySelectorAll('script,style,noscript,svg').forEach(n => n.remove());
    }

    const allowedData = new Set(['data-testid', 'data-component-type', 'data-action']);
    const keepAttr = (name) => {
      if (name === 'id') return true;
      if (name === 'class') return true;
      if (name === 'role') return true;
      if (name.startsWith('aria-')) return true;
      if (name === 'name' || name === 'type' || name === 'placeholder') return true;
      if (name === 'href' || name === 'src' || name === 'value' || name === 'title') return true;
      if (name.startsWith('data-') && allowedData.has(name)) return true;
      return false;
    };

    const isBadClass = (c) => {
      if (!c) return true;
      if (/^css-/i.test(c)) return true;
      if (/^sc-/i.test(c)) return true;
      if (/^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/.test(c)) return true;
      if (/^[a-z]{3,5}-[0-9a-f]{5,}$/i.test(c)) return true;
      return false;
    };

    const cleanElement = (el) => {
      try {
        const attrs = Array.from(el.attributes || []);
        for (const a of attrs) {
          const n = a.name;
          if (!keepAttr(n)) el.removeAttribute(n);
        }
        if (el.hasAttribute('class')) {
          const cleaned = String(el.getAttribute('class') || '')
            .split(/\s+/)
            .filter((c) => c && !isBadClass(c))
            .join(' ');
          if (cleaned) el.setAttribute('class', cleaned);
          else el.removeAttribute('class');
        }
      } catch {}
    };

    if (clone && clone.nodeType === 1) cleanElement(clone);
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) cleanElement(walker.currentNode);

    const textWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const toRemove = [];
    while (textWalker.nextNode()) {
      const n = textWalker.currentNode;
      if (!n.nodeValue || !String(n.nodeValue).trim()) toRemove.push(n);
    }
    for (const n of toRemove) {
      try { n.parentNode && n.parentNode.removeChild(n); } catch {}
    }

    const keepEmptyTags = new Set(['img','input','textarea','select','option','button','a','video','audio','source']);
    const prune = (node) => {
      if (!node || node.nodeType !== 1) return;
      const children = Array.from(node.children || []);
      for (const child of children) prune(child);
      const tag = String(node.tagName || '').toLowerCase();
      if (keepEmptyTags.has(tag)) return;
      const hasAttrs = node.attributes && node.attributes.length > 0;
      const hasChildren = node.childNodes && node.childNodes.length > 0;
      const text = String(node.textContent || '').trim();
      if (!hasAttrs && !hasChildren && !text) {
        try { node.parentNode && node.parentNode.removeChild(node); } catch {}
      }
    };
    prune(clone);

    const html = (clone && clone.innerHTML) ? String(clone.innerHTML) : String(root.innerHTML || '');
    return { url, html };
  })()`;

  try {
    const res = await _extBridge.callDevice({
      deviceId,
      op: 'eval',
      payload: { expression },
      timeoutMs: 1_500,
    });

    if (typeof res === 'string') return { html: res.slice(0, maxChars) };
    if (res && typeof res === 'object') {
      const url = typeof (res as any).url === 'string' ? String((res as any).url) : undefined;
      const html = typeof (res as any).html === 'string' ? String((res as any).html) : JSON.stringify(res);
      return { url, html: String(html).slice(0, maxChars) };
    }

    return { html: String(res ?? '').slice(0, maxChars) };
  } catch (err) {
    logGateway('[heal] failed to capture DOM excerpt', serializeError(err));
    return { html: '' };
  }
}

function buildPrompt(req: HealRequest, domExcerpt: string, url?: string): string {
  return `You are a CSS selector repair assistant. A web automation script tried to use a CSS selector that doesn't exist on the page.

FAILED SELECTOR: ${req.selector}
OPERATION: ${req.op} (what the script was trying to do with this element)
ERROR: ${req.error}
WEBSITE: ${url || req.url || ''}

Your task: analyze the DOM excerpt below and find the correct CSS selector that matches what the original selector was TRYING to target.

Think step by step:
1. What kind of element was the original selector trying to find? (e.g., search box, button, product list, input field)
2. Look for elements in the DOM that serve that purpose
3. Prefer selectors using: id > data-testid > aria-label > role > unique class > tag+attribute combo
4. NEVER use hash-like generated classes (e.g., .css-1a2b3c, .sc-xyz123)

DOM EXCERPT:
${domExcerpt}

Return ONLY a JSON object: {"selector": "css-selector", "confidence": 0.0-1.0, "reasoning": "one line explanation"}`;
}

function tryParseJsonObject(text: string): { selector?: unknown; confidence?: unknown; reasoning?: unknown } | null {
  const t = (text ?? '').trim();
  if (!t) return null;

  // Common LLM formatting: ```json ... ```
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : t;

  // Try direct parse first.
  try {
    const obj = JSON.parse(candidate);
    if (obj && typeof obj === 'object') return obj as any;
  } catch {
    // continue
  }

  // Fallback: try to extract the first {...} block.
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const obj = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      if (obj && typeof obj === 'object') return obj as any;
    } catch {
      // ignore
    }
  }

  return null;
}

async function callLLM(prompt: string, config: LLMConfig): Promise<string | null> {
  const url = `${config.baseUrl}/chat/completions`;
  const timeoutMs = config.timeoutMs ?? 15_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const body = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 500,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      logGateway('[heal] LLM request failed', { status: res.status, statusText: res.statusText });
      return null;
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    logGateway('[heal] LLM response missing content', { data });
    return null;
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      logGateway('[heal] LLM request timeout', { timeoutMs });
    } else {
      logGateway('[heal] LLM request error', serializeError(err));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function attemptHeal(req: HealRequest): Promise<HealResult | null> {
  if (!_config.enabled) return null;

  const selector = (req.selector ?? '').trim();
  if (!selector) return null;

  const maxChars = Math.max(1000, Math.min(_config.domSnapshotMaxChars, 50_000));

  let domExcerpt = (req.pageContext ?? '').toString();
  let detectedUrl: string | undefined = req.url;
  if (!domExcerpt) {
    const rawDOM = await getDomExcerpt(req.deviceId, maxChars * 2); // Get more, then clean
    detectedUrl = detectedUrl ?? rawDOM.url;
    domExcerpt = extractSmartDOM(rawDOM.html, selector, maxChars);
  } else {
    domExcerpt = extractSmartDOM(domExcerpt, selector, maxChars);
  }

  const prompt = buildPrompt(req, domExcerpt, detectedUrl);

  logGateway('[heal] calling LLM', {
    provider: _config.llm.provider,
    model: _config.llm.model,
    baseUrl: _config.llm.baseUrl,
    promptLength: prompt.length,
  });

  const text = await callLLM(prompt, _config.llm);

  if (!text) {
    logGateway('[heal] LLM returned no text');
    return null;
  }

  const parsed = tryParseJsonObject(text);
  if (!parsed) {
    logGateway('[heal] failed to parse LLM response', { text: text.slice(0, 200) });
    return null;
  }

  const newSel = typeof parsed.selector === 'string' ? parsed.selector.trim() : '';
  const confRaw = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0;
  const reasoning = typeof (parsed as any).reasoning === 'string' ? String((parsed as any).reasoning).trim() : undefined;

  if (!newSel) {
    logGateway('[heal] LLM returned empty selector');
    return null;
  }

  logGateway('[heal] LLM success', { newSelector: newSel, confidence });

  return {
    newSelector: newSel,
    confidence,
    reasoning,
  };
}
