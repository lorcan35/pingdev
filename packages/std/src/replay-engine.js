/**
 * Record → Replay Engine
 *
 * Takes a recorded action sequence and replays it via the extension bridge.
 * Features:
 * - Selector resilience: tries primary selector, falls back to alternatives
 * - Variable extraction: detects repeated patterns for parameterization
 * - Timing: replay at configurable speed (instant, real-time, custom delays)
 */
// ---------------------------------------------------------------------------
// Replay Engine
// ---------------------------------------------------------------------------
export class ReplayEngine {
    extBridge;
    constructor(extBridge) {
        this.extBridge = extBridge;
    }
    /**
     * Replay a recording against a device.
     */
    async replay(deviceId, recording, options = {}) {
        const speed = options.speed ?? 0; // 0 = instant
        const timeout = options.timeout ?? 10_000;
        const startTime = Date.now();
        const steps = [];
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
            // Skip actions without a valid type
            if (!action.type) {
                const durationMs = Date.now() - stepStart;
                steps.push({ index: i, action, status: 'skipped', error: 'No action type', durationMs });
                continue;
            }
            try {
                const selector = this.pickBestSelector(action);
                // Skip selector-dependent actions with no selector
                const selectorRequired = ['click', 'input', 'submit', 'select', 'dblclick'].includes(action.type);
                if (selectorRequired && !selector) {
                    const durationMs = Date.now() - stepStart;
                    steps.push({ index: i, action, status: 'skipped', error: 'No selector available', durationMs });
                    continue;
                }
                await this.executeAction(deviceId, action, selector, timeout);
                const durationMs = Date.now() - stepStart;
                steps.push({ index: i, action, status: 'ok', selector, durationMs });
                successCount++;
            }
            catch (err) {
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
                }
                else {
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
    pickBestSelector(action) {
        // Handle multiple recording formats:
        // - Gateway format: { type, selectors: { css, ariaLabel, ... } }
        // - Extension export format: { type, selector: "..." }
        // - Extension raw format: { type, value: "...", url: "..." }
        const raw = action;
        if (typeof raw.selector === 'string' && raw.selector) {
            return raw.selector;
        }
        if (!action.selectors)
            return undefined;
        const s = action.selectors;
        if (!s || typeof s !== 'object')
            return undefined;
        // Priority: CSS > ariaLabel > textContent > xpath > nthChild
        return s.css ?? s.ariaLabel ?? s.textContent ?? s.xpath ?? s.nthChild;
    }
    getAllSelectors(action) {
        const result = [];
        // Handle extension export format with flat `selector` field
        const raw = action;
        if (typeof raw.selector === 'string' && raw.selector) {
            result.push(raw.selector);
        }
        if (!action.selectors)
            return result;
        const s = action.selectors;
        if (s.css)
            result.push(s.css);
        if (s.ariaLabel)
            result.push(`[aria-label="${s.ariaLabel}"]`);
        if (s.textContent)
            result.push(`:has-text("${s.textContent}")`);
        if (s.xpath)
            result.push(s.xpath);
        if (s.nthChild)
            result.push(s.nthChild);
        return result;
    }
    async executeAction(deviceId, action, selector, timeout) {
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
            case 'act':
                // Replay an LLM-driven instruction
                return this.extBridge.callDevice({
                    deviceId,
                    op: 'act',
                    payload: { instruction: action.value ?? '' },
                    timeoutMs: timeout,
                });
            case 'select':
                return this.extBridge.callDevice({
                    deviceId,
                    op: 'select',
                    payload: { selector, value: action.value },
                    timeoutMs: timeout,
                });
            case 'dblclick':
                return this.extBridge.callDevice({
                    deviceId,
                    op: 'dblclick',
                    payload: { selector },
                    timeoutMs: timeout,
                });
            case 'extract':
                // Read-only action — no-op during replay (data already captured)
                return { ok: true, skipped: true };
            // Gateway API op types: replay by forwarding the original input payload
            case 'smartNavigate':
                return this.extBridge.callDevice({
                    deviceId,
                    op: 'smartNavigate',
                    payload: action.input ?? { to: action.value ?? '' },
                    timeoutMs: timeout,
                });
            case 'fill':
            case 'wait':
            case 'table':
            case 'dialog':
            case 'paginate':
            case 'selectOption':
            case 'hover':
            case 'assert':
            case 'network':
            case 'storage':
            case 'capture':
            case 'download':
            case 'annotate':
            case 'observe':
            case 'read':
            case 'discover':
            case 'eval':
            case 'screenshot':
            case 'upload':
                // Generic gateway op replay: forward the original input payload
                return this.extBridge.callDevice({
                    deviceId,
                    op: action.type,
                    payload: action.input ?? {},
                    timeoutMs: timeout,
                });
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }
    async tryFallbackSelectors(deviceId, action, timeout) {
        const selectors = this.getAllSelectors(action);
        // Skip the first one (already tried)
        for (let i = 1; i < selectors.length; i++) {
            try {
                await this.executeAction(deviceId, action, selectors[i], timeout);
                return { success: true, selector: selectors[i] };
            }
            catch {
                // Try next
            }
        }
        return { success: false };
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=replay-engine.js.map