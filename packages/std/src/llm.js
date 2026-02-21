// @pingdev/std — Universal LLM caller module
// Re-uses the fetch-based OpenAI-compatible pattern from self-heal.ts.
import { logGateway } from './gw-log.js';
import { DEFAULT_SELF_HEAL_CONFIG } from './self-heal.js';
import { getLocalConfig, getModelForFeature, getTimeoutForFeature, isLocalMode, truncateDom, } from './local-mode.js';
import { getSuggestPrompt } from './local-prompts.js';
import { repairLLMJson } from './json-repair.js';
// Strip <think> blocks from local model responses
function stripThinkBlocks(text) {
    // Remove <think>...</think> blocks (non-greedy, handles newlines)
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Also handle unclosed <think> at start (model started thinking but didn't close)
    cleaned = cleaned.replace(/^<think>[\s\S]*$/gi, '').trim();
    return cleaned;
}
/** Build an LLMConfig from environment variables, falling back to self-heal defaults. */
export function getLLMConfig(feature) {
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
export async function callLLM(prompt, opts) {
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
        const headers = {
            'Content-Type': 'application/json',
        };
        if (cfg.apiKey) {
            headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        }
        const messages = [];
        if (opts?.systemPrompt) {
            messages.push({ role: 'system', content: opts.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        const body = {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
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
        const data = await res.json();
        let content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            content = stripThinkBlocks(content);
        }
        if (typeof content === 'string') {
            return content;
        }
        logGateway('[llm] response missing content', { data });
        throw new Error('LLM response missing content');
    }
    catch (err) {
        if (err.name === 'AbortError') {
            logGateway('[llm] request timeout', { timeoutMs, feature });
            throw new Error(`LLM request timeout after ${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
function applyTemplate(template, values) {
    return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value ?? '')), template);
}
/** Generate a contextual suggestion for a device interaction. */
export async function suggest(deviceId, context, question) {
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
            const conf = typeof parsed.confidence === 'number'
                ? parsed.confidence
                : Number(parsed.confidence);
            const confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5;
            return { suggestion: parsed.suggestion, confidence };
        }
    }
    catch {
        // fallback below
    }
    // Fallback: treat the entire response as the suggestion
    return { suggestion: text.trim(), confidence: 0.5 };
}
/** Call an OpenAI-compatible LLM with optional vision (image) content. */
export async function callLLMVision(prompt, opts) {
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
        const headers = {
            'Content-Type': 'application/json',
        };
        if (cfg.apiKey) {
            headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        }
        // Build content array with text and images
        const content = [];
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
        const messages = [];
        if (opts?.systemPrompt) {
            messages.push({ role: 'system', content: opts.systemPrompt });
        }
        messages.push({ role: 'user', content: content });
        const body = {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
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
        const data = await res.json();
        let responseContent = data?.choices?.[0]?.message?.content;
        if (typeof responseContent === 'string') {
            responseContent = stripThinkBlocks(responseContent);
        }
        if (typeof responseContent === 'string') {
            return responseContent;
        }
        logGateway('[llm] vision response missing content', { data });
        throw new Error('LLM vision response missing content');
    }
    catch (err) {
        if (err.name === 'AbortError') {
            logGateway('[llm] vision request timeout', { timeoutMs });
            throw new Error(`LLM vision request timeout after ${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
function parsePositiveIntEnv(name) {
    const raw = process.env[name];
    if (!raw)
        return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
//# sourceMappingURL=llm.js.map