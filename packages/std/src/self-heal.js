// @pingdev/std — JIT selector self-healing
// Attempts to repair broken CSS selectors using a DOM excerpt + an LLM.
import { logGateway, serializeError } from './gw-log.js';
import { getLocalConfig, getModelForFeature, getTimeoutForFeature, isLocalMode, truncateDom } from './local-mode.js';
import { getHealPrompt } from './local-prompts.js';
import { repairLLMJson } from './json-repair.js';
export const DEFAULT_SELF_HEAL_CONFIG = {
    enabled: true,
    maxAttempts: 2,
    domSnapshotMaxChars: 5_000,
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
let _extBridge = null;
let _config = { ...DEFAULT_SELF_HEAL_CONFIG };
let _registry = null;
export function configureSelfHeal(opts) {
    _extBridge = opts.extBridge;
    _registry = opts.registry ?? null;
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
function extractSmartDOM(rawHTML, failedSelector, maxChars) {
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
        const cleaned = classes
            .split(/\s+/)
            .filter((c) => {
            // Keep classes that look semantic (no random hashes)
            if (!c)
                return false;
            if (/^css-/i.test(c))
                return false;
            if (/^sc-/i.test(c))
                return false;
            if (/^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/.test(c))
                return false;
            if (/^[a-z]{3,5}-[0-9a-f]{5,}$/i.test(c))
                return false;
            if (/^[A-Z][a-zA-Z0-9_-]{6,}$/.test(c))
                return false;
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
async function getDomExcerpt(deviceId, maxChars) {
    if (!_extBridge)
        return { html: '' };
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
        if (typeof res === 'string')
            return { html: res.slice(0, maxChars) };
        if (res && typeof res === 'object') {
            const url = typeof res.url === 'string' ? String(res.url) : undefined;
            const html = typeof res.html === 'string' ? String(res.html) : JSON.stringify(res);
            return { url, html: String(html).slice(0, maxChars) };
        }
        return { html: String(res ?? '').slice(0, maxChars) };
    }
    catch (err) {
        logGateway('[heal] failed to capture DOM excerpt', serializeError(err));
        return { html: '' };
    }
}
function buildPrompt(req, domExcerpt, url) {
    const local = isLocalMode();
    const tpl = getHealPrompt(local);
    const prompt = tpl.userTemplate
        .replace('{{selector}}', req.selector)
        .replace('{{operation}}', req.op)
        .replace('{{error}}', req.error)
        .replace('{{url}}', url || req.url || '')
        .replace('{{dom}}', domExcerpt);
    return prompt;
}
function stripThinkBlocks(text) {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^<think>[\s\S]*$/gi, '').trim();
    return cleaned;
}
async function callLLM(prompt, config) {
    const local = isLocalMode();
    const localCfg = getLocalConfig();
    const baseUrl = local ? localCfg.llmBaseUrl : config.baseUrl;
    const url = `${baseUrl}/chat/completions`;
    const timeoutMs = local
        ? getTimeoutForFeature('heal')
        : (config.timeoutMs ?? 15_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        const promptDef = getHealPrompt(local);
        const body = {
            model: local
                ? (getModelForFeature('heal') || config.model)
                : config.model,
            messages: [
                ...(promptDef.system ? [{ role: 'system', content: promptDef.system }] : []),
                { role: 'user', content: prompt },
            ],
            temperature: config.temperature ?? 0.2,
            max_tokens: local ? 4096 : (config.maxTokens ?? 500),
            response_format: { type: 'json_object' },
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
        let content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            content = stripThinkBlocks(content);
            return content;
        }
        logGateway('[heal] LLM response missing content', { data });
        return null;
    }
    catch (err) {
        if (err.name === 'AbortError') {
            logGateway('[heal] LLM request timeout', { timeoutMs });
        }
        else {
            logGateway('[heal] LLM request error', serializeError(err));
        }
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
export async function attemptHeal(req) {
    if (!_config.enabled)
        return null;
    const selector = (req.selector ?? '').trim();
    if (!selector)
        return null;
    const local = isLocalMode();
    const localCfg = getLocalConfig();
    const domMaxFromEnv = Number.parseInt(process.env.PINGOS_LLM_HEAL_DOM_MAX_CHARS || '', 10);
    const domMaxChars = Number.isFinite(domMaxFromEnv) && domMaxFromEnv > 0
        ? domMaxFromEnv
        : (local ? localCfg.domLimit : _config.domSnapshotMaxChars);
    const maxChars = Math.max(1000, Math.min(domMaxChars, 50_000));
    let domExcerpt = (req.pageContext ?? '').toString();
    let detectedUrl = req.url;
    if (!domExcerpt) {
        const rawDOM = await getDomExcerpt(req.deviceId, maxChars * 2); // Get more, then clean
        detectedUrl = detectedUrl ?? rawDOM.url;
        domExcerpt = extractSmartDOM(rawDOM.html, selector, maxChars);
    }
    else {
        domExcerpt = extractSmartDOM(domExcerpt, selector, maxChars);
    }
    if (local) {
        domExcerpt = truncateDom(domExcerpt, localCfg.domLimit);
    }
    const maxDomChars = parseInt(process.env.PINGOS_DOM_LIMIT ?? '5000', 10);
    const truncatedDom = domExcerpt.length > maxDomChars ? domExcerpt.slice(0, maxDomChars) + '\n<!-- truncated -->' : domExcerpt;
    const prompt = buildPrompt(req, truncatedDom, detectedUrl);
    logGateway('[heal] calling LLM', {
        provider: _config.llm.provider,
        model: _config.llm.model,
        baseUrl: _config.llm.baseUrl,
        promptLength: prompt.length,
        usingRegistry: !!_registry,
    });
    // Try registry-based LLM first, fall back to direct callLLM
    let text = null;
    if (_registry) {
        try {
            const driver = _registry.resolve({ prompt, require: { llm: true } });
            const result = await driver.execute({ prompt, timeout_ms: _config.llm.timeoutMs ?? 15_000 });
            text = result.text || null;
            logGateway('[heal] used registry driver', { driver: driver.registration.id });
        }
        catch (err) {
            logGateway('[heal] registry LLM failed, falling back to direct', serializeError(err));
            text = await callLLM(prompt, _config.llm);
        }
    }
    else {
        text = await callLLM(prompt, _config.llm);
    }
    if (!text) {
        logGateway('[heal] LLM returned no text');
        return null;
    }
    let parsed = null;
    try {
        const repaired = repairLLMJson(text);
        parsed = repaired && typeof repaired === 'object'
            ? repaired
            : null;
    }
    catch {
        parsed = null;
    }
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
//# sourceMappingURL=self-heal.js.map