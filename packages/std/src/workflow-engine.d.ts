/**
 * WorkflowEngine — condition evaluation, template resolution, and workflow ops.
 *
 * TypeScript counterpart of packages/python-sdk/pingos/template_engine.py + workflow runner.
 * Supports: if, loop, set, assert, error recovery (retry/skip/fallback/abort).
 */
export interface WorkflowStep {
    op: string;
    [key: string]: unknown;
    onError?: 'retry' | 'skip' | 'fallback' | 'abort';
    maxRetries?: number;
    default?: unknown;
    fallback?: WorkflowStep[];
    condition?: string;
    then?: WorkflowStep[];
    else?: WorkflowStep[];
    over?: string;
    as?: string;
    steps?: WorkflowStep[];
    var?: string;
    value?: string;
    message?: string;
}
export interface WorkflowDefaults {
    onError?: string;
    maxTotalRetries?: number;
}
export interface StepResult {
    step: WorkflowStep;
    result: unknown;
}
export interface ErrorLogEntry {
    step_index: number;
    error: string;
    recovery_action: string;
    retries: number;
}
export interface WorkflowResult {
    steps: StepResult[];
    variables: Variables;
    errors?: ErrorLogEntry[];
    aborted?: boolean;
}
type Variables = Record<string, unknown>;
export declare function resolveTemplate(text: string, variables: Variables): string;
export declare function resolveValue(text: string, variables: Variables): unknown;
export declare function evaluateCondition(condition: string, variables: Variables): boolean;
/** Callback type for executing a browser operation. */
export type OpExecutor = (op: string, resolved: Record<string, unknown>) => Promise<unknown>;
export declare class WorkflowEngine {
    private variables;
    private results;
    private errorLog;
    private defaults;
    private totalRetriesUsed;
    private executor;
    constructor(executor: OpExecutor, inputs?: Variables, defaults?: WorkflowDefaults);
    /** Run a list of steps. Returns the workflow result. */
    run(steps: WorkflowStep[]): Promise<WorkflowResult>;
    private resolveStep;
    private runSteps;
    private sleep;
    private handleErrorRecovery;
}
export {};
//# sourceMappingURL=workflow-engine.d.ts.map