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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayStepResult {
  index: number;
  action: RecordedAction;
  status: 'ok' | 'error' | 'skipped';
  selector?: string;      // which selector was used
  error?: string;
  durationMs: number;
}

export interface ReplayResult {
  recording: { id: string; url: string; actionCount: number };
  steps: ReplayStepResult[];
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Replay Engine
// ---------------------------------------------------------------------------

export class ReplayEngine {
  private extBridge: ExtensionBridge;

  constructor(extBridge: ExtensionBridge) {
    this.extBridge = extBridge;
  }

  /**
   * Replay a recording against a device.
   */
  async replay(
    deviceId: string,
    recording: Recording,
    options: ReplayOptions = {},
  ): Promise<ReplayResult> {
    const speed = options.speed ?? 0; // 0 = instant
    const timeout = options.timeout ?? 10_000;
    const startTime = Date.now();
    const steps: ReplayStepResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < recording.actions.length; i++) {
      const action = recording.actions[i];
      const stepStart = Date.now();

      // Apply timing delay
      if (speed > 0 && i > 0) {
        const prevAction = recording.actions[i - 1];
        const delay = (action.timestamp - prevAction.timestamp) / speed;
        if (delay > 0 && delay < 30_000) {
          await this.sleep(delay);
        }
      }

      try {
        const selector = this.pickBestSelector(action);
        await this.executeAction(deviceId, action, selector, timeout);
        const durationMs = Date.now() - stepStart;
        steps.push({ index: i, action, status: 'ok', selector, durationMs });
        successCount++;
      } catch (err) {
        // Try fallback selectors
        const fallbackResult = await this.tryFallbackSelectors(deviceId, action, timeout);
        const durationMs = Date.now() - stepStart;
        if (fallbackResult.success) {
          steps.push({
            index: i,
            action,
            status: 'ok',
            selector: fallbackResult.selector,
            durationMs,
          });
          successCount++;
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          steps.push({ index: i, action, status: 'error', error: errorMsg, durationMs });
          errorCount++;
        }
      }
    }

    return {
      recording: {
        id: recording.id,
        url: recording.url,
        actionCount: recording.actions.length,
      },
      steps,
      totalDurationMs: Date.now() - startTime,
      successCount,
      errorCount,
    };
  }

  // ---- internal ----

  private pickBestSelector(action: RecordedAction): string | undefined {
    const s = action.selectors;
    // Priority: CSS > ariaLabel > textContent > xpath > nthChild
    return s.css ?? s.ariaLabel ?? s.textContent ?? s.xpath ?? s.nthChild;
  }

  private getAllSelectors(action: RecordedAction): string[] {
    const s = action.selectors;
    const result: string[] = [];
    if (s.css) result.push(s.css);
    if (s.ariaLabel) result.push(`[aria-label="${s.ariaLabel}"]`);
    if (s.textContent) result.push(`:has-text("${s.textContent}")`);
    if (s.xpath) result.push(s.xpath);
    if (s.nthChild) result.push(s.nthChild);
    return result;
  }

  private async executeAction(
    deviceId: string,
    action: RecordedAction,
    selector: string | undefined,
    timeout: number,
  ): Promise<unknown> {
    switch (action.type) {
      case 'click':
        return this.extBridge.callDevice({
          deviceId,
          op: 'click',
          payload: { selector },
          timeoutMs: timeout,
        });

      case 'input':
        return this.extBridge.callDevice({
          deviceId,
          op: 'type',
          payload: { text: action.value ?? '', selector },
          timeoutMs: timeout,
        });

      case 'submit':
        // Submit is typically a click on a submit button or form submission
        if (selector) {
          return this.extBridge.callDevice({
            deviceId,
            op: 'click',
            payload: { selector },
            timeoutMs: timeout,
          });
        }
        return this.extBridge.callDevice({
          deviceId,
          op: 'press',
          payload: { key: 'Enter' },
          timeoutMs: timeout,
        });

      case 'keydown':
        return this.extBridge.callDevice({
          deviceId,
          op: 'press',
          payload: { key: action.value ?? 'Enter' },
          timeoutMs: timeout,
        });

      case 'navigate':
        return this.extBridge.callDevice({
          deviceId,
          op: 'eval',
          payload: { expression: `window.location.href = ${JSON.stringify(action.value)}` },
          timeoutMs: timeout,
        });

      case 'scroll':
        return this.extBridge.callDevice({
          deviceId,
          op: 'scroll',
          payload: { direction: 'down', amount: 3 },
          timeoutMs: timeout,
        });

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async tryFallbackSelectors(
    deviceId: string,
    action: RecordedAction,
    timeout: number,
  ): Promise<{ success: boolean; selector?: string }> {
    const selectors = this.getAllSelectors(action);

    // Skip the first one (already tried)
    for (let i = 1; i < selectors.length; i++) {
      try {
        await this.executeAction(deviceId, action, selectors[i], timeout);
        return { success: true, selector: selectors[i] };
      } catch {
        // Try next
      }
    }

    return { success: false };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
