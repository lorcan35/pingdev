// Visual Extract — screenshot-based extraction using vision models
// Triggered when DOM extract returns empty and fallback: "visual" is set,
// or explicitly via strategy: "visual", or for canvas/SVG content.
import { callLLMVision } from './llm.js';
import { logGateway } from './gw-log.js';
import { getLocalConfig, getTimeoutForFeature, isLocalMode, truncateDom } from './local-mode.js';
import { getVisualPrompt } from './local-prompts.js';
import { repairLLMJson } from './json-repair.js';
const screenshotCache = new Map();
const SCREENSHOT_CACHE_TTL_MS = 5000;
function envInt(name, fallback) {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
function envStr(name) {
    const value = (process.env[name] || '').trim();
    return value || undefined;
}
function getCachedScreenshot(deviceId) {
    const entry = screenshotCache.get(deviceId);
    if (!entry)
        return null;
    if (Date.now() - entry.timestamp > SCREENSHOT_CACHE_TTL_MS) {
        screenshotCache.delete(deviceId);
        return null;
    }
    return entry.data;
}
function setCachedScreenshot(deviceId, data) {
    screenshotCache.set(deviceId, { data, timestamp: Date.now() });
}
/**
 * Call the vision LLM with retry logic (max 2 retries, 1s delay)
 * and a 15-second timeout per attempt.
 */
async function callVisionWithRetry(prompt, opts, maxRetries = 2) {
    const local = isLocalMode();
    const timeoutMs = local ? getTimeoutForFeature('visual') : envInt('PINGOS_LLM_VISUAL_TIMEOUT_MS', 15_000);
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await Promise.race([
                callLLMVision(prompt, opts),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Vision API timeout (${timeoutMs}ms)`)), timeoutMs)),
            ]);
            return result;
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetries) {
                logGateway('[visual-extract] LLM attempt failed, retrying', {
                    attempt: attempt + 1,
                    error: lastError.message,
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    throw lastError ?? new Error('Vision API failed after retries');
}
/**
 * Extract structured data from a page by taking a screenshot and using a vision model.
 *
 * Flow:
 * 1. Take screenshot of the viewport or specified element (with caching)
 * 2. Send to vision-capable LLM (with retry and timeout)
 * 3. Prompt with schema description for structured extraction
 * 4. Parse LLM response into JSON
 */
export async function visualExtract(extBridge, opts) {
    const { deviceId, schema, query } = opts;
    const local = isLocalMode();
    const localCfg = getLocalConfig();
    const localVisualModel = localCfg.visionModel || localCfg.models.vision || '';
    const startMs = Date.now();
    let retries = 0;
    let usedCache = false;
    let warning;
    // 1. Take a screenshot (check cache first)
    let screenshotData = getCachedScreenshot(deviceId);
    if (screenshotData) {
        usedCache = true;
    }
    else {
        try {
            const screenshotResult = await extBridge.callDevice({
                deviceId,
                op: 'screenshot',
                payload: {},
                timeoutMs: 10_000,
            });
            const ssObj = screenshotResult;
            screenshotData = ssObj?.data ??
                ssObj?.screenshot ??
                ssObj?.image ??
                null;
            // Handle nested data object
            if (!screenshotData && ssObj?.data && typeof ssObj.data === 'object') {
                const dataObj = ssObj.data;
                screenshotData = dataObj?.screenshot ??
                    dataObj?.image ??
                    dataObj?.dataUrl ??
                    null;
            }
            // Cache the screenshot for reuse
            if (screenshotData) {
                setCachedScreenshot(deviceId, screenshotData);
            }
        }
        catch (err) {
            logGateway('[visual-extract] screenshot failed', { error: String(err) });
        }
    }
    // 2. Build the extraction prompt
    let fieldDescription = '';
    if (schema && Object.keys(schema).length > 0) {
        fieldDescription = Object.entries(schema)
            .map(([key, desc]) => `- "${key}": ${desc}`)
            .join('\n');
    }
    else if (query) {
        fieldDescription = `Extract: ${query}`;
    }
    else {
        fieldDescription = 'Extract all visible structured data (titles, prices, descriptions, dates, etc.)';
    }
    const promptDef = getVisualPrompt(local);
    const prompt = promptDef.userTemplate.replace('{{fields}}', fieldDescription);
    // 3. Call the LLM with retry logic (vision when screenshot available, text fallback otherwise)
    let llmResponse;
    try {
        if (screenshotData && (!local || !!localVisualModel)) {
            llmResponse = await callVisionWithRetry(prompt, {
                images: [screenshotData],
                model: local ? localVisualModel : envStr('PINGOS_LLM_VISUAL_MODEL'),
                maxTokens: local ? 4096 : envInt('PINGOS_LLM_VISUAL_MAX_TOKENS', 1500),
                temperature: 0.1,
                timeoutMs: local ? getTimeoutForFeature('visual') : envInt('PINGOS_LLM_VISUAL_TIMEOUT_MS', 15_000),
                responseFormatJson: true,
                systemPrompt: promptDef.system,
                feature: 'visual',
            });
        }
        else {
            if (local && screenshotData && !localVisualModel) {
                warning = 'No local vision model configured; used text fallback extraction.';
            }
            // No screenshot — fall back to text extraction
            let pageText = '';
            try {
                const evalResult = await extBridge.callDevice({
                    deviceId,
                    op: 'eval',
                    payload: { expression: `document.body.innerText.substring(0, ${envInt('PINGOS_LLM_VISUAL_TEXT_MAX_CHARS', 5000)})` },
                    timeoutMs: 5_000,
                });
                const evalObj = evalResult;
                pageText = evalObj?.data ?? evalObj?.result ?? '';
                if (typeof pageText === 'object') {
                    pageText = pageText?.result ?? '';
                }
            }
            catch { /* ignore */ }
            const contextPrompt = `${promptDef.userTemplate.replace('{{fields}}', fieldDescription)}\ntext:\n${truncateDom(pageText, local ? localCfg.domLimit : 5000)}`;
            llmResponse = await callVisionWithRetry(contextPrompt, {
                model: local ? (localCfg.llmModel || 'default') : envStr('PINGOS_LLM_VISUAL_MODEL'),
                maxTokens: local ? 4096 : envInt('PINGOS_LLM_VISUAL_TEXT_MAX_TOKENS', 1000),
                temperature: 0.1,
                timeoutMs: local ? getTimeoutForFeature('visual') : envInt('PINGOS_LLM_VISUAL_TIMEOUT_MS', 15_000),
                responseFormatJson: true,
                systemPrompt: promptDef.system,
                feature: 'visual',
            }, 1); // fewer retries for text fallback
        }
    }
    catch (err) {
        logGateway('[visual-extract] LLM call failed after retries', { error: String(err) });
        return {
            data: {},
            _meta: {
                strategy: 'visual',
                confidence: 0,
                duration_ms: Date.now() - startMs,
            },
        };
    }
    // 4. Parse the LLM response into JSON
    let extractedData = {};
    try {
        const parsed = repairLLMJson(llmResponse);
        if (parsed && typeof parsed === 'object') {
            extractedData = parsed;
        }
    }
    catch {
        logGateway('[visual-extract] JSON parse failed', { response: llmResponse.slice(0, 200) });
    }
    const fieldCount = Object.keys(extractedData).length;
    const confidence = screenshotData
        ? Math.min(0.9, fieldCount * 0.2) // vision-based: higher confidence
        : Math.min(0.8, fieldCount * 0.15); // text-fallback: lower confidence
    return {
        data: extractedData,
        _meta: {
            strategy: 'visual',
            confidence,
            duration_ms: Date.now() - startMs,
            model: screenshotData ? (local ? (localVisualModel || localCfg.llmModel || 'default') : (envStr('PINGOS_LLM_VISUAL_MODEL') ?? 'default')) : undefined,
            retries,
            cached: usedCache,
            warning,
        },
    };
}
//# sourceMappingURL=visual-extract.js.map