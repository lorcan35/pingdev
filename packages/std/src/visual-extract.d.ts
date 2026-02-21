import type { ExtensionBridge } from './ext-bridge.js';
export interface VisualExtractOptions {
    deviceId: string;
    schema?: Record<string, string>;
    query?: string;
    strategy: 'visual';
}
export interface VisualExtractResult {
    data: Record<string, unknown>;
    _meta: {
        strategy: 'visual';
        confidence: number;
        duration_ms: number;
        model?: string;
        retries?: number;
        cached?: boolean;
        warning?: string;
    };
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
export declare function visualExtract(extBridge: ExtensionBridge, opts: VisualExtractOptions): Promise<VisualExtractResult>;
//# sourceMappingURL=visual-extract.d.ts.map