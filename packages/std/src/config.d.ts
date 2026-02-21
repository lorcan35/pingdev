import type { DriverCapabilities, RoutingStrategy } from './types.js';
import { type SelfHealConfig } from './self-heal.js';
export interface DriverConfig {
    id: string;
    type: 'pingapp' | 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'lmstudio' | 'openai_compat';
    endpoint: string;
    model?: string;
    apiKeyEnv?: string;
    priority?: number;
    capabilities?: Partial<DriverCapabilities>;
    enabled?: boolean;
}
export interface LLMProviderConfig {
    openrouter?: {
        apiKey: string;
        defaultModel?: string;
        fallbackModel?: string;
        siteUrl?: string;
        siteName?: string;
    };
    anthropic?: {
        apiKey?: string;
        model?: string;
    };
    openai?: {
        apiKey?: string;
        model?: string;
    };
    ollama?: {
        baseUrl: string;
        model: string;
    };
    lmstudio?: {
        baseUrl: string;
        model: string;
    };
}
export interface PingOSConfig {
    gatewayPort: number;
    drivers: DriverConfig[];
    defaultStrategy: RoutingStrategy;
    healthIntervalMs: number;
    selfHeal: SelfHealConfig;
    llm?: LLMProviderConfig;
    localMode?: {
        enabled?: boolean;
        llmBaseUrl?: string;
        llmModel?: string;
        llmApiKey?: string;
        visionBaseUrl?: string;
        visionModel?: string;
        domLimit?: number;
        jsonMode?: boolean;
        timeouts?: Partial<{
            query: number;
            heal: number;
            generate: number;
            suggest: number;
            extract: number;
            discover: number;
            visual: number;
            default: number;
        }>;
        models?: Partial<{
            extract: string;
            heal: string;
            generate: string;
            vision: string;
        }>;
    };
}
export declare const DEFAULT_CONFIG: PingOSConfig;
/**
 * Load PingOS config from ~/.pingos/config.json.
 * Falls back to DEFAULT_CONFIG if the file does not exist.
 */
export declare function loadConfig(path?: string): Promise<PingOSConfig>;
//# sourceMappingURL=config.d.ts.map