import type { DriverCapabilities, RoutingStrategy } from './types.js';
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
export interface PingOSConfig {
    gatewayPort: number;
    drivers: DriverConfig[];
    defaultStrategy: RoutingStrategy;
    healthIntervalMs: number;
}
export declare const DEFAULT_CONFIG: PingOSConfig;
/**
 * Load PingOS config from ~/.pingos/config.json.
 * Falls back to DEFAULT_CONFIG if the file does not exist.
 */
export declare function loadConfig(path?: string): Promise<PingOSConfig>;
//# sourceMappingURL=config.d.ts.map