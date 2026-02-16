"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../src/state-machine/index.js");
(0, vitest_1.describe)('UIStateMachine', () => {
    (0, vitest_1.it)('starts in IDLE state by default', () => {
        const sm = new index_js_1.UIStateMachine();
        (0, vitest_1.expect)(sm.state).toBe('IDLE');
    });
    (0, vitest_1.it)('transitions between valid states', () => {
        const sm = new index_js_1.UIStateMachine();
        sm.transition('TYPING', 'test');
        (0, vitest_1.expect)(sm.state).toBe('TYPING');
        sm.transition('GENERATING', 'test');
        (0, vitest_1.expect)(sm.state).toBe('GENERATING');
        sm.transition('DONE', 'test');
        (0, vitest_1.expect)(sm.state).toBe('DONE');
    });
    (0, vitest_1.it)('records timeline entries', () => {
        const sm = new index_js_1.UIStateMachine();
        sm.transition('TYPING', 'test-trigger', 'test detail');
        (0, vitest_1.expect)(sm.timeline).toHaveLength(1);
        (0, vitest_1.expect)(sm.timeline[0]).toMatchObject({
            from: 'IDLE',
            to: 'TYPING',
            trigger: 'test-trigger',
            details: 'test detail',
        });
    });
    (0, vitest_1.it)('ignores same-state transitions', () => {
        const sm = new index_js_1.UIStateMachine();
        sm.transition('IDLE', 'test');
        (0, vitest_1.expect)(sm.timeline).toHaveLength(0);
    });
    (0, vitest_1.it)('accepts custom transition config', () => {
        const sm = new index_js_1.UIStateMachine({
            transitions: { A: ['B'], B: ['C', 'A'], C: ['A'] },
            initialState: 'A',
        });
        (0, vitest_1.expect)(sm.state).toBe('A');
        sm.transition('B', 'test');
        (0, vitest_1.expect)(sm.state).toBe('B');
    });
    (0, vitest_1.it)('resets to initial state', () => {
        const sm = new index_js_1.UIStateMachine();
        sm.transition('TYPING', 'test');
        sm.reset();
        (0, vitest_1.expect)(sm.state).toBe('IDLE');
        (0, vitest_1.expect)(sm.timeline).toHaveLength(0);
    });
});
//# sourceMappingURL=state-machine.test.js.map