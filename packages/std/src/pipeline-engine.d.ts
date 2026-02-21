/**
 * Cross-Tab Data Pipes — Pipeline Engine
 *
 * Unix pipe-style data flow between browser tabs. Supports:
 * - Sequential and parallel step execution
 * - Variable interpolation between steps ({{variable}} syntax)
 * - Transform steps (string templates, no tab needed)
 * - Error handling per step: skip, abort, retry
 *
 * Pipeline format:
 *   { name, steps: [{ id, tab?, op, schema?, template?, input?, output?, onError? }], parallel?: string[] }
 *
 * Pipe shorthand: "extract:amazon:.price | transform:'Deal: {{value}}' | type:slack:#msg"
 */
import type { PipelineDef, PipelineResult } from './types.js';
import type { ExtensionBridge } from './ext-bridge.js';
export declare class PipelineEngine {
    private extBridge;
    private gatewayBaseUrl;
    constructor(extBridge: ExtensionBridge, opts?: {
        gatewayBaseUrl?: string;
    });
    /**
     * Validate a pipeline definition. Returns a list of errors (empty = valid).
     */
    validate(pipeline: PipelineDef): string[];
    /**
     * Execute a pipeline definition. Returns detailed results.
     */
    run(pipeline: PipelineDef): Promise<PipelineResult>;
    /**
     * Parse pipe shorthand syntax into a PipelineDef.
     * Format: "op:tab:selector | op:tab:selector | ..."
     */
    static parsePipeShorthand(pipeStr: string, name?: string): PipelineDef;
    private executeStep;
    private handleStepError;
    private serializeError;
    private resolveTabDevice;
    private resolveReadParams;
    private readWithFallback;
    private readViaGateway;
    private isCssSelectorRead;
    private getRawReadSelector;
    private isVariableReference;
    private isReadErrorResult;
}
//# sourceMappingURL=pipeline-engine.d.ts.map