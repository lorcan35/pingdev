/**
 * Record → Replay Engine
 *
 * Takes a recorded action sequence and replays it via the extension bridge.
 * Features:
 * - Selector resilience: tries primary selector, falls back to alternatives
 * - Variable extraction: detects repeated patterns for parameterization
 * - Timing: replay at configurable speed (instant, real-time, custom delays)
 */
import type { ExtensionBridge } from './ext-bridge.js';
import type { RecordedAction, Recording, ReplayOptions } from './types.js';
export interface ReplayStepResult {
    index: number;
    action: RecordedAction;
    status: 'ok' | 'error' | 'skipped';
    selector?: string;
    error?: string;
    durationMs: number;
}
export interface ReplayResult {
    recording: {
        id: string;
        url: string;
        actionCount: number;
    };
    steps: ReplayStepResult[];
    totalDurationMs: number;
    successCount: number;
    errorCount: number;
}
export declare class ReplayEngine {
    private extBridge;
    constructor(extBridge: ExtensionBridge);
    /**
     * Replay a recording against a device.
     */
    replay(deviceId: string, recording: Recording, options?: ReplayOptions): Promise<ReplayResult>;
    private pickBestSelector;
    private getAllSelectors;
    private executeAction;
    private tryFallbackSelectors;
    private sleep;
}
//# sourceMappingURL=replay-engine.d.ts.map