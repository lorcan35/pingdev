// @pingdev/std — JIT selector self-healing
// Attempts to repair broken CSS selectors using a DOM excerpt + an LLM.

import { logGateway, serializeError } from './gw-log.js';

export const DEFAULT_SELF_HEAL_CONFIG = {
  enabled: true,
  maxAttempts: 2,
  domSnapshotMaxChars: 15000,
  minConfidence: 0.5,
  llm: {
    provider: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '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',
    model: 'meta-llama/llama-3.3-70b-instruct',
    maxTokens: 500,
    temperature: 0.2,
    timeoutMs: 15000,
  },
};

let _extBridge = null;
let _config = { ...DEFAULT_SELF_HEAL_CONFIG };

export function configureSelfHeal(opts) {
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

function extractSmartDOM(rawHTML, failedSelector, maxChars) {
  let html = rawHTML;

  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  html = html.replace(/class="([^"]*)"/gi, (match, classes) => {
    const cleaned = classes
      .split(/\s+/)
      .filter((c) => {
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

  html = html.replace(/\s(?:style|onclick|onload|on\w+)="[^"]*"/gi, '');
  html = html.replace(/\sdata-(?!(?:testid|component-type|action)\b)[\w-]+="[^"]*"/gi, '');
  html = html.replace(/\s+/g, ' ').trim();

  if (html.length > maxChars) {
    html = html.slice(0, maxChars);
  }

  return html;
}

async function getDomExcerpt(deviceId, maxChars) {
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
      timeoutMs: 1500,
    });

    if (typeof res === 'string') return { html: res.slice(0, maxChars) };
    if (res && typeof res === 'object') {
      const url = typeof res.url === 'string' ? String(res.url) : undefined;
      const html = typeof res.html === 'string' ? String(res.html) : JSON.stringify(res);
      return { url, html: String(html).slice(0, maxChars) };
    }

    return { html: String(res ?? '').slice(0, maxChars) };
  } catch (err) {
    logGateway('[heal] failed to capture DOM excerpt', serializeError(err));
    return { html: '' };
  }
}

function buildPrompt(req, domExcerpt) {
  return `You are a CSS selector repair assistant. A web automation script tried to use a CSS selector that doesn't exist on the page.

FAILED SELECTOR: ${req.selector}
OPERATION: ${req.op} (what the script was trying to do with this element)
ERROR: ${req.error}
WEBSITE: ${req.url || ''}

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

function tryParseJsonObject(text) {
  const t = (text ?? '').trim();
  if (!t) return null;

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : t;

  try {
    const obj = JSON.parse(candidate);
    if (obj && typeof obj === 'object') return obj;
  } catch {
    // continue
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const obj = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      if (obj && typeof obj === 'object') return obj;
    } catch {
      // ignore
    }
  }

  return null;
}

async function callLLM(prompt, config) {
  const url = `${config.baseUrl}/chat/completions`;
  const timeoutMs = config.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
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

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    logGateway('[heal] LLM response missing content', { data });
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      logGateway('[heal] LLM request timeout', { timeoutMs });
    } else {
      logGateway('[heal] LLM request error', serializeError(err));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function attemptHeal(req) {
  if (!_config.enabled) return null;

  const selector = (req.selector ?? '').trim();
  if (!selector) return null;

  const maxChars = Math.max(1000, Math.min(_config.domSnapshotMaxChars, 50000));

  let domExcerpt = (req.pageContext ?? '').toString();
  if (!domExcerpt) {
    const rawDOM = await getDomExcerpt(req.deviceId, maxChars * 2);
    req.url = req.url || rawDOM.url;
    domExcerpt = extractSmartDOM(rawDOM.html, selector, maxChars);
  } else {
    domExcerpt = extractSmartDOM(domExcerpt, selector, maxChars);
  }

  const prompt = buildPrompt(req, domExcerpt);

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
  const reasoning = typeof parsed.reasoning === 'string' ? String(parsed.reasoning).trim() : undefined;

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
