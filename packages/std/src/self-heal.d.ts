import type { ExtensionBridge } from './ext-bridge.js';
import type { ModelRegistry } from './registry.js';
export interface HealRequest {
    deviceId: string;
    op: string;
    selector: string;
    error: string;
    /** Optional URL of the page where the selector failed (best-effort). */
    url?: string;
    pageContext?: string;
}
export interface HealResult {
    newSelector: string;
    confidence: number;
    /** One-line explanation from the LLM (best-effort). */
    reasoning?: string;
}
export interface LLMConfig {
    provider: 'openai-compat';
    baseUrl: string;
    apiKey?: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}
export interface SelfHealConfig {
    enabled: boolean;
    maxAttempts: number;
    domSnapshotMaxChars: number;
    minConfidence: number;
    llm: LLMConfig;
}
export declare const DEFAULT_SELF_HEAL_CONFIG: SelfHealConfig;
export declare function configureSelfHeal(opts: {
    extBridge: ExtensionBridge;
    config?: Partial<SelfHealConfig>;
    registry?: ModelRegistry;
}): void;
export declare function attemptHeal(req: HealRequest): Promise<HealResult | null>;
//# sourceMappingURL=self-heal.d.ts.map