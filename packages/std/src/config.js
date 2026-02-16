// @pingdev/std — Configuration types and loader
// Config location: ~/.pingos/config.json
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_SELF_HEAL_CONFIG } from './self-heal.js';
// ---------------------------------------------------------------------------
// Default Config — 3 PingApps pre-registered
// ---------------------------------------------------------------------------
export const DEFAULT_CONFIG = {
    gatewayPort: 3500,
    defaultStrategy: 'best',
    healthIntervalMs: 30_000,
    selfHeal: DEFAULT_SELF_HEAL_CONFIG,
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

        const selfHealParsed = parsed.selfHeal;
        const selfHeal = {
            ...DEFAULT_SELF_HEAL_CONFIG,
            ...(selfHealParsed ?? {}),
            llmModel: selfHealParsed && 'llmModel' in selfHealParsed
                ? (selfHealParsed.llmModel ?? null)
                : DEFAULT_SELF_HEAL_CONFIG.llmModel,
        };
        return {
            gatewayPort: parsed.gatewayPort ?? DEFAULT_CONFIG.gatewayPort,
            defaultStrategy: parsed.defaultStrategy ?? DEFAULT_CONFIG.defaultStrategy,
            healthIntervalMs: parsed.healthIntervalMs ?? DEFAULT_CONFIG.healthIntervalMs,
            selfHeal,
            drivers: parsed.drivers ?? DEFAULT_CONFIG.drivers,
        };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
//# sourceMappingURL=config.js.map
