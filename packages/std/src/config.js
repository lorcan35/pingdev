// @pingdev/std — Configuration types and loader
// Config location: ~/.pingos/config.json
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_SELF_HEAL_CONFIG, } from './self-heal.js';
// ---------------------------------------------------------------------------
// Default Config — 3 PingApps pre-registered
// ---------------------------------------------------------------------------
export const DEFAULT_CONFIG = {
    gatewayPort: 3500,
    defaultStrategy: 'best',
    healthIntervalMs: 30_000,
    selfHeal: DEFAULT_SELF_HEAL_CONFIG,
    localMode: {
        enabled: false, // PINGOS_LOCAL_MODE
        llmBaseUrl: 'http://localhost:1234/v1', // PINGOS_LLM_BASE_URL
        llmModel: '', // PINGOS_LLM_MODEL (auto-detect in main.ts when empty)
        llmApiKey: 'local', // PINGOS_LLM_API_KEY
        visionBaseUrl: 'http://localhost:1234/v1', // PINGOS_VISION_BASE_URL
        visionModel: '', // PINGOS_VISION_MODEL
        domLimit: 5000, // PINGOS_LOCAL_DOM_LIMIT
        jsonMode: true, // PINGOS_LOCAL_JSON_MODE
        timeouts: {
            query: 60000, // PINGOS_LLM_QUERY_TIMEOUT_MS
            heal: 30000, // PINGOS_LLM_HEAL_TIMEOUT_MS
            generate: 120000, // PINGOS_LLM_GENERATE_TIMEOUT_MS
            suggest: 60000, // PINGOS_LLM_SUGGEST_TIMEOUT_MS
            extract: 60000, // PINGOS_LLM_EXTRACT_TIMEOUT_MS
            discover: 45000, // PINGOS_LLM_DISCOVER_TIMEOUT_MS
            visual: 90000, // PINGOS_LLM_VISUAL_TIMEOUT_MS
            default: 60000, // PINGOS_LLM_TIMEOUT_MS
        },
        models: {},
    },
    drivers: [
        {
            id: 'gemini',
            type: 'pingapp',
            endpoint: 'http://localhost:3456',
            priority: 1,
            capabilities: {
                llm: true,
                streaming: true,
                vision: true,
                toolCalling: true,
                imageGen: true,
                search: true,
                deepResearch: true,
                thinking: true,
            },
        },
        {
            id: 'ai-studio',
            type: 'pingapp',
            endpoint: 'http://localhost:3457',
            priority: 2,
            capabilities: {
                llm: true,
                streaming: true,
                vision: true,
                toolCalling: true,
                imageGen: false,
                search: false,
                deepResearch: false,
                thinking: true,
            },
        },
        {
            id: 'chatgpt',
            type: 'pingapp',
            endpoint: 'http://localhost:3458',
            priority: 3,
            capabilities: {
                llm: true,
                streaming: true,
                vision: true,
                toolCalling: true,
                imageGen: true,
                search: true,
                deepResearch: true,
                thinking: true,
            },
        },
    ],
};
// ---------------------------------------------------------------------------
// Config Loader
// ---------------------------------------------------------------------------
const CONFIG_PATH = join(homedir(), '.pingos', 'config.json');
/**
 * Load PingOS config from ~/.pingos/config.json.
 * Falls back to DEFAULT_CONFIG if the file does not exist.
 */
export async function loadConfig(path) {
    const configPath = path ?? CONFIG_PATH;
    try {
        const raw = await readFile(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Self-heal is optional in config.json; merge with defaults.
        // Backwards-compat: older configs may specify `llmModel` at top-level.
        const selfHealParsed = parsed.selfHeal;
        const llmModelCompat = selfHealParsed && 'llmModel' in selfHealParsed ? selfHealParsed.llmModel : undefined;
        const selfHeal = {
            ...DEFAULT_SELF_HEAL_CONFIG,
            ...(selfHealParsed ?? {}),
            llm: {
                ...DEFAULT_SELF_HEAL_CONFIG.llm,
                ...(selfHealParsed?.llm ?? {}),
                model: (llmModelCompat ?? selfHealParsed?.llm?.model ?? DEFAULT_SELF_HEAL_CONFIG.llm.model),
            },
        };
        return {
            gatewayPort: parsed.gatewayPort ?? DEFAULT_CONFIG.gatewayPort,
            defaultStrategy: parsed.defaultStrategy ?? DEFAULT_CONFIG.defaultStrategy,
            healthIntervalMs: parsed.healthIntervalMs ?? DEFAULT_CONFIG.healthIntervalMs,
            selfHeal,
            drivers: parsed.drivers ?? DEFAULT_CONFIG.drivers,
            llm: parsed.llm,
            localMode: parsed.localMode ?? DEFAULT_CONFIG.localMode,
        };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
//# sourceMappingURL=config.js.map