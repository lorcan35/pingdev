// Template Learning — learn extraction templates from successful extractions,
// store them, and auto-apply on future visits to matching URLs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logGateway } from './gw-log.js';
import { repairLLMJson } from './json-repair.js';
// ---------------------------------------------------------------------------
// Template Storage
// ---------------------------------------------------------------------------
const TEMPLATE_DIR = join(homedir(), '.pingos', 'templates');
function ensureDir() {
    if (!existsSync(TEMPLATE_DIR)) {
        mkdirSync(TEMPLATE_DIR, { recursive: true });
    }
}
function templatePath(domain) {
    // Sanitize domain for filename
    const safe = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    return join(TEMPLATE_DIR, `${safe}.json`);
}
/** Load a template for a specific domain. */
export function loadTemplate(domain) {
    const path = templatePath(domain);
    if (!existsSync(path))
        return null;
    try {
        return repairLLMJson(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
/** Save a template for a domain. */
export function saveTemplate(template) {
    ensureDir();
    writeFileSync(templatePath(template.domain), JSON.stringify(template, null, 2));
}
/** Delete a template for a domain. */
export function deleteTemplate(domain) {
    const path = templatePath(domain);
    if (!existsSync(path))
        return false;
    unlinkSync(path);
    return true;
}
/** List all saved templates. */
export function listTemplates() {
    ensureDir();
    const files = readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'));
    const results = [];
    for (const file of files) {
        try {
            const template = repairLLMJson(readFileSync(join(TEMPLATE_DIR, file), 'utf-8'));
            const total = template.successCount + template.failCount;
            results.push({
                domain: template.domain,
                urlPattern: template.urlPattern,
                hitCount: template.hitCount,
                successRate: total > 0 ? template.successCount / total : 0,
            });
        }
        catch { /* skip corrupt files */ }
    }
    return results;
}
/** Export a template as JSON. */
export function exportTemplate(domain) {
    return loadTemplate(domain);
}
/** Import a template from JSON. */
export function importTemplate(data) {
    if (!data.domain)
        throw new Error('Template must have a domain');
    data.updatedAt = Date.now();
    saveTemplate(data);
}
// ---------------------------------------------------------------------------
// Template Matching
// ---------------------------------------------------------------------------
/**
 * Find a template that matches the given URL.
 * Returns the template if found and URL matches the stored pattern.
 */
export function findTemplateForUrl(url) {
    let domain;
    try {
        domain = new URL(url).hostname;
    }
    catch {
        return null;
    }
    const template = loadTemplate(domain);
    if (!template)
        return null;
    // Check URL pattern match
    try {
        const pattern = new RegExp(template.urlPattern);
        if (pattern.test(url))
            return template;
    }
    catch {
        // Invalid regex — try simple string match
        if (url.includes(template.urlPattern))
            return template;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Template Learning
// ---------------------------------------------------------------------------
/**
 * Learn a template from a successful extraction on the current page.
 *
 * @param extBridge - Extension bridge for calling device operations
 * @param deviceId - Device/tab to learn from
 * @param extractionResult - The successful extraction result
 * @param schema - The schema that was used
 */
export async function learnTemplate(extBridge, deviceId, extractionResult, schema) {
    // Get the current page URL
    let url = '';
    let pageType = 'unknown';
    try {
        const urlResult = await extBridge.callDevice({
            deviceId,
            op: 'getUrl',
            payload: {},
            timeoutMs: 5_000,
        });
        // callDevice returns response.data from the extension — for getUrl this is
        // the URL string directly (background.ts sends result: response.data).
        if (typeof urlResult === 'string') {
            url = urlResult;
        }
        else {
            const urlObj = urlResult;
            url = urlObj?.data ?? urlObj?.url ?? '';
            if (typeof url === 'object') {
                url = url?.url ?? '';
            }
        }
    }
    catch { /* ignore */ }
    // Fallback: get URL from shared tabs list if getUrl failed or returned empty
    if (!url || url === 'about:blank') {
        for (const { tabs } of extBridge.listSharedTabs()) {
            for (const tab of tabs ?? []) {
                if (tab.deviceId === deviceId && tab.url) {
                    url = tab.url;
                    break;
                }
            }
            if (url)
                break;
        }
    }
    // Fallback: eval window.location.href if still no URL
    if (!url || url === 'about:blank') {
        try {
            const evalResult = await extBridge.callDevice({
                deviceId,
                op: 'eval',
                payload: { expression: 'window.location.href' },
                timeoutMs: 5_000,
            });
            const evalUrl = unwrapString(evalResult);
            if (evalUrl.startsWith('http')) {
                url = evalUrl;
            }
        }
        catch { /* ignore */ }
    }
    // Try to discover page type
    try {
        const discoverResult = await extBridge.callDevice({
            deviceId,
            op: 'discover',
            payload: {},
            timeoutMs: 10_000,
        });
        const discObj = discoverResult;
        pageType = discObj?.pageType ?? 'unknown';
    }
    catch { /* ignore */ }
    let domain;
    try {
        domain = new URL(url).hostname;
    }
    catch {
        domain = 'unknown';
    }
    // Generate URL pattern from the current URL
    const urlPattern = generateUrlPattern(url);
    // Collect CSS selectors from the extraction metadata
    const meta = extractionResult._meta;
    const selectorsUsed = meta?.selectors_used ?? {};
    // Build selectors map: prefer actual CSS selectors from metadata,
    // fall back to schema values only if they look like CSS selectors
    const selectors = {};
    const alternatives = {};
    for (const key of Object.keys(schema)) {
        const alts = [];
        if (selectorsUsed[key]) {
            // Use the actual CSS selector that worked
            selectors[key] = selectorsUsed[key];
            alts.push(selectorsUsed[key]);
        }
        // Check if the schema value looks like a CSS selector
        const schemaVal = schema[key];
        if (looksLikeCssSelector(schemaVal)) {
            if (!selectors[key])
                selectors[key] = schemaVal;
            if (!alts.includes(schemaVal))
                alts.push(schemaVal);
        }
        // Otherwise, don't store the schema description as a selector
        if (alts.length > 0)
            alternatives[key] = alts;
    }
    // Check for existing template
    const existing = loadTemplate(domain);
    const template = {
        domain,
        urlPattern,
        pageType,
        selectors,
        alternatives,
        schema,
        sampleData: extractionResult.result ?? extractionResult,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        hitCount: existing?.hitCount ?? 0,
        successCount: (existing?.successCount ?? 0) + 1,
        failCount: existing?.failCount ?? 0,
    };
    // Don't persist templates with unknown domain — they can't be matched later
    if (domain === 'unknown') {
        logGateway('[template-learner] cannot learn template — URL unknown', { deviceId });
        return template;
    }
    saveTemplate(template);
    logGateway('[template-learner] learned template', { domain, urlPattern, fields: Object.keys(schema).length });
    return template;
}
/**
 * Apply a template for extraction — use stored selectors.
 * If selectors fail, attempt self-healing.
 */
export async function applyTemplate(extBridge, deviceId, template) {
    // Build a clean selector map — prefer CSS selectors, skip non-CSS values.
    // Also merge in any alternative CSS selectors that weren't set as primary.
    const cleanSelectors = {};
    for (const [key, sel] of Object.entries(template.selectors)) {
        if (sel && looksLikeCssSelector(sel)) {
            cleanSelectors[key] = sel;
        }
        else if (template.alternatives?.[key]) {
            // Primary isn't a valid CSS selector — use first valid alternative
            const firstCss = template.alternatives[key].find(a => looksLikeCssSelector(a));
            if (firstCss)
                cleanSelectors[key] = firstCss;
        }
    }
    // Try primary selectors (only if we have any valid ones)
    if (Object.keys(cleanSelectors).length > 0) {
        try {
            const result = await extBridge.callDevice({
                deviceId,
                op: 'extract',
                payload: { schema: cleanSelectors },
                timeoutMs: 20_000,
            });
            const resObj = result;
            const resData = (resObj?.result ?? resObj?.data ?? resObj);
            // Check if extraction was successful (non-empty)
            const nonEmpty = Object.entries(resData).filter(([k, v]) => !k.startsWith('_') && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0));
            if (nonEmpty.length > 0) {
                // Update hit count
                template.hitCount++;
                template.successCount++;
                template.updatedAt = Date.now();
                saveTemplate(template);
                return { data: resData, healed: false };
            }
        }
        catch { /* primary selectors failed */ }
    }
    // Try alternative selectors
    if (template.alternatives) {
        for (const [key, alts] of Object.entries(template.alternatives)) {
            for (const alt of alts) {
                if (alt === template.selectors[key])
                    continue; // skip primary (already tried)
                try {
                    const result = await extBridge.callDevice({
                        deviceId,
                        op: 'extract',
                        payload: { schema: { [key]: alt } },
                        timeoutMs: 10_000,
                    });
                    const resObj = result;
                    const resData = (resObj?.result ?? resObj?.data ?? resObj);
                    if (resData[key] && resData[key] !== '') {
                        // Update the template with the working selector
                        template.selectors[key] = alt;
                        template.updatedAt = Date.now();
                        template.hitCount++;
                        template.successCount++;
                        saveTemplate(template);
                        logGateway('[template-learner] self-healed selector', { key, oldSelector: template.selectors[key], newSelector: alt });
                    }
                }
                catch { /* try next alternative */ }
            }
        }
        // Try full extraction with updated selectors
        try {
            const result = await extBridge.callDevice({
                deviceId,
                op: 'extract',
                payload: { schema: template.selectors },
                timeoutMs: 20_000,
            });
            const resObj = result;
            const resData = (resObj?.result ?? resObj?.data ?? resObj);
            return { data: resData, healed: true };
        }
        catch { /* fall through */ }
    }
    // All selectors failed — try schema-based extraction as last resort.
    // Namespace field lookups to avoid collisions (e.g., a template field named
    // "title" should not accidentally match the page's <title> element).
    if (template.schema && Object.keys(template.schema).length > 0) {
        try {
            // Build a namespaced schema: for fields that share names with common HTML
            // elements (title, link, meta, etc.), add a context qualifier to the
            // description so the extractor targets content-area elements, not head tags.
            const COLLISION_TAGS = new Set(['title', 'link', 'meta', 'style', 'script', 'head', 'body', 'html']);
            const namespacedSchema = {};
            for (const [key, desc] of Object.entries(template.schema)) {
                if (COLLISION_TAGS.has(key.toLowerCase()) && !looksLikeCssSelector(desc)) {
                    // Qualify the description to avoid matching the HTML tag itself
                    namespacedSchema[key] = `${desc} (from the main content area, not the <${key.toLowerCase()}> HTML element)`;
                }
                else {
                    namespacedSchema[key] = desc;
                }
            }
            const result = await extBridge.callDevice({
                deviceId,
                op: 'extract',
                payload: { schema: namespacedSchema },
                timeoutMs: 20_000,
            });
            const resObj = result;
            const resData = (resObj?.result ?? resObj?.data ?? resObj);
            const nonEmpty = Object.entries(resData).filter(([k, v]) => !k.startsWith('_') && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0));
            if (nonEmpty.length > 0) {
                template.hitCount++;
                template.successCount++;
                template.updatedAt = Date.now();
                saveTemplate(template);
                return { data: resData, healed: true };
            }
        }
        catch { /* fall through */ }
    }
    // Everything failed
    template.hitCount++;
    template.failCount++;
    template.updatedAt = Date.now();
    saveTemplate(template);
    return { data: {}, healed: false };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Check if a string looks like a CSS selector (starts with ., #, [, or a tag name). */
function looksLikeCssSelector(val) {
    if (!val || typeof val !== 'string')
        return false;
    // CSS selectors start with ., #, [, or a tag/element name, and often contain
    // selector-specific characters. Text descriptions typically contain spaces and
    // no selector operators.
    return /^[.#\[]/.test(val) || /^[a-z][\w-]*(\s*[>.~+\[:]|\s*$)/i.test(val);
}
/** Unwrap a possibly nested result into a string. */
function unwrapString(val) {
    if (typeof val === 'string')
        return val;
    if (val && typeof val === 'object') {
        const obj = val;
        const candidate = obj.data ?? obj.result ?? obj.url ?? '';
        if (typeof candidate === 'string')
            return candidate;
        if (candidate && typeof candidate === 'object') {
            const inner = candidate;
            return (inner.result ?? inner.url ?? '');
        }
    }
    return '';
}
/**
 * Generate a URL pattern from a concrete URL.
 * Replaces numeric path segments with regex wildcards.
 * e.g., "https://example.com/products/123/reviews" → "https://example\\.com/products/\\d+/reviews"
 */
function generateUrlPattern(url) {
    try {
        const parsed = new URL(url);
        const escapedHost = parsed.hostname.replace(/\./g, '\\.');
        const pathPattern = parsed.pathname
            .replace(/\/\d+/g, '/\\d+') // numeric segments
            .replace(/\/[a-f0-9]{8,}/g, '/[a-f0-9]+') // hash/UUID segments
            .replace(/\//g, '\\/');
        return `^https?:\\/\\/${escapedHost}${pathPattern}`;
    }
    catch {
        return url;
    }
}
//# sourceMappingURL=template-learner.js.map