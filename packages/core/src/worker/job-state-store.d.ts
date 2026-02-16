import type { UIState, UISubstate, LiveJobState, JobTiming } from '../types.js';
export declare function initJobState(jobId: string, tool: string | null, mode: string | null): LiveJobState;
export declare function getJobState(jobId: string): LiveJobState | undefined;
export declare function updateState(jobId: string, newState: UIState, trigger: string, details?: string): void;
export declare function setSubstate(jobId: string, substate: UISubstate): void;
export declare function updateTiming(jobId: string, updates: Partial<JobTiming>): void;
export declare function setThinking(jobId: string, thinking: string): void;
export declare function setPartialResponse(jobId: string, text: string): void;
export declare function setProgressText(jobId: string, text: string): void;
export declare function setArtifactPath(jobId: string, path: string): void;
export declare function removeJobState(jobId: string): void;
//# sourceMappingURL=job-state-store.d.ts.map