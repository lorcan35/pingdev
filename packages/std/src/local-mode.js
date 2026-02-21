// @pingdev/std — Local mode configuration and helpers
function envBool(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v))
        return true;
    if (['0', 'false', 'no', 'off'].includes(v))
        return false;
    return fallback;
}
function envInt(name, fallback) {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
function envStr(name) {
    const value = (process.env[name] || '').trim();
    return value || undefined;
}
function normalizeBaseUrl(url) {
    const trimmed = url.replace(/\/$/, '');
    if (trimmed.endsWith('/v1'))
        return trimmed;
    if (trimmed.includes('/v1/'))
        return trimmed.replace(/\/$/, '');
    return `${trimmed}/v1`;
}
export function getLocalConfig() {
    const enabled = envBool('PINGOS_LOCAL_MODE', false);
    const llmBaseUrl = normalizeBaseUrl(envStr('PINGOS_LLM_BASE_URL') ?? 'http://localhost:1234/v1');
    const llmModel = envStr('PINGOS_LLM_MODEL') ?? '';
    const llmApiKey = envStr('PINGOS_LLM_API_KEY') ?? 'local';
    const visionBaseUrl = normalizeBaseUrl(envStr('PINGOS_VISION_BASE_URL') ?? llmBaseUrl);
    const visionModel = envStr('PINGOS_VISION_MODEL') ?? llmModel;
    const defaultTimeout = envInt('PINGOS_LLM_TIMEOUT_MS', 60_000);
    return {
        enabled,
        llmBaseUrl,
        llmModel,
        llmApiKey,
        visionBaseUrl,
        visionModel,
        domLimit: envInt('PINGOS_LOCAL_DOM_LIMIT', 5_000),
        responseFormat: envBool('PINGOS_LOCAL_JSON_MODE', true),
        timeouts: {
            query: envInt('PINGOS_LLM_QUERY_TIMEOUT_MS', 60_000),
            heal: envInt('PINGOS_LLM_HEAL_TIMEOUT_MS', 30_000),
            generate: envInt('PINGOS_LLM_GENERATE_TIMEOUT_MS', 180_000),
            suggest: envInt('PINGOS_LLM_SUGGEST_TIMEOUT_MS', 60_000),
            extract: envInt('PINGOS_LLM_EXTRACT_TIMEOUT_MS', 60_000),
            discover: envInt('PINGOS_LLM_DISCOVER_TIMEOUT_MS', 45_000),
            visual: envInt('PINGOS_LLM_VISUAL_TIMEOUT_MS', 90_000),
            default: defaultTimeout,
        },
        models: {
            extract: envStr('PINGOS_LLM_EXTRACT_MODEL'),
            heal: envStr('PINGOS_LLM_HEAL_MODEL'),
            generate: envStr('PINGOS_LLM_GENERATE_MODEL'),
            vision: envStr('PINGOS_VISION_MODEL') ?? envStr('PINGOS_LLM_VISUAL_MODEL'),
        },
    };
}
export function isLocalMode() {
    const cfg = getLocalConfig();
    if (cfg.enabled)
        return true;
    const baseUrl = (process.env.PINGOS_LLM_BASE_URL || '').trim();
    return baseUrl.length > 0;
}
export function getTimeoutForFeature(feature) {
    const cfg = getLocalConfig();
    const key = (feature || 'default').toLowerCase();
    if (!cfg.enabled) {
        return envInt('PINGOS_LLM_TIMEOUT_MS', 15_000);
    }
    if (key === 'query')
        return cfg.timeouts.query;
    if (key === 'heal')
        return cfg.timeouts.heal;
    if (key === 'generate')
        return cfg.timeouts.generate;
    if (key === 'suggest')
        return cfg.timeouts.suggest;
    if (key === 'extract' || key === 'paginate')
        return cfg.timeouts.extract;
    if (key === 'discover')
        return cfg.timeouts.discover;
    if (key === 'visual' || key === 'vision')
        return cfg.timeouts.visual;
    return cfg.timeouts.default;
}
export function getModelForFeature(feature) {
    const cfg = getLocalConfig();
    const key = (feature || 'default').toLowerCase();
    if (!cfg.enabled) {
        return envStr('PINGOS_LLM_MODEL') ?? '';
    }
    if ((key === 'extract' || key === 'paginate') && cfg.models.extract)
        return cfg.models.extract;
    if (key === 'heal' && cfg.models.heal)
        return cfg.models.heal;
    if (key === 'generate' && cfg.models.generate)
        return cfg.models.generate;
    if ((key === 'visual' || key === 'vision') && cfg.models.vision)
        return cfg.models.vision;
    if ((key === 'visual' || key === 'vision') && cfg.visionModel)
        return cfg.visionModel;
    return cfg.llmModel || 'default';
}
export function truncateDom(html, limit) {
    const text = String(html ?? '');
    const max = Math.max(500, limit ?? getLocalConfig().domLimit);
    if (text.length <= max)
        return text;
    return text.slice(0, max);
}
export function compressPrompt(prompt) {
    return String(prompt ?? '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
//# sourceMappingURL=local-mode.js.map