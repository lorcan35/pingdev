"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const store = __importStar(require("../src/worker/job-state-store.js"));
(0, vitest_1.describe)('JobStateStore', () => {
    (0, vitest_1.beforeEach)(() => {
        // Clean up any previous state
        store.removeJobState('test-job-1');
        store.removeJobState('test-job-2');
    });
    (0, vitest_1.it)('initializes job state', () => {
        const state = store.initJobState('test-job-1', 'tool1', 'mode1');
        (0, vitest_1.expect)(state.job_id).toBe('test-job-1');
        (0, vitest_1.expect)(state.state).toBe('IDLE');
        (0, vitest_1.expect)(state.tool_used).toBe('tool1');
        (0, vitest_1.expect)(state.mode).toBe('mode1');
    });
    (0, vitest_1.it)('retrieves job state', () => {
        store.initJobState('test-job-1', null, null);
        const state = store.getJobState('test-job-1');
        (0, vitest_1.expect)(state).toBeDefined();
        (0, vitest_1.expect)(state.job_id).toBe('test-job-1');
    });
    (0, vitest_1.it)('returns undefined for unknown jobs', () => {
        (0, vitest_1.expect)(store.getJobState('nonexistent')).toBeUndefined();
    });
    (0, vitest_1.it)('updates state and records transitions', () => {
        store.initJobState('test-job-1', null, null);
        store.updateState('test-job-1', 'TYPING', 'type-prompt');
        const state = store.getJobState('test-job-1');
        (0, vitest_1.expect)(state.state).toBe('TYPING');
        (0, vitest_1.expect)(state.state_history).toHaveLength(1);
        (0, vitest_1.expect)(state.state_history[0]).toMatchObject({
            from: 'IDLE',
            to: 'TYPING',
            trigger: 'type-prompt',
        });
    });
    (0, vitest_1.it)('sets substate', () => {
        store.initJobState('test-job-1', null, null);
        store.setSubstate('test-job-1', 'researching');
        (0, vitest_1.expect)(store.getJobState('test-job-1').substate).toBe('researching');
    });
    (0, vitest_1.it)('updates timing', () => {
        store.initJobState('test-job-1', null, null);
        store.updateTiming('test-job-1', { started_at: '2025-01-01T00:00:00Z' });
        (0, vitest_1.expect)(store.getJobState('test-job-1').timing.started_at).toBe('2025-01-01T00:00:00Z');
    });
    (0, vitest_1.it)('sets partial response and thinking', () => {
        store.initJobState('test-job-1', null, null);
        store.setPartialResponse('test-job-1', 'Hello');
        store.setThinking('test-job-1', 'I am thinking');
        const state = store.getJobState('test-job-1');
        (0, vitest_1.expect)(state.partial_response).toBe('Hello');
        (0, vitest_1.expect)(state.thinking).toBe('I am thinking');
    });
    (0, vitest_1.it)('removes job state', () => {
        store.initJobState('test-job-1', null, null);
        store.removeJobState('test-job-1');
        (0, vitest_1.expect)(store.getJobState('test-job-1')).toBeUndefined();
    });
});
//# sourceMappingURL=job-state-store.test.js.map