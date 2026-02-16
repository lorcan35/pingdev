"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIStateMachine = void 0;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'state-machine' });
/** Default valid transitions. */
const DEFAULT_TRANSITIONS = {
    IDLE: ['TYPING', 'NEEDS_HUMAN'],
    TYPING: ['GENERATING', 'IDLE', 'FAILED', 'NEEDS_HUMAN'],
    GENERATING: ['DONE', 'FAILED', 'NEEDS_HUMAN'],
    DONE: ['IDLE'],
    FAILED: ['IDLE'],
    NEEDS_HUMAN: ['IDLE'],
};
class UIStateMachine {
    _state;
    _timeline = [];
    transitions;
    constructor(config) {
        this._state = config?.initialState ?? 'IDLE';
        this.transitions = config?.transitions ?? DEFAULT_TRANSITIONS;
    }
    get state() {
        return this._state;
    }
    get timeline() {
        return this._timeline;
    }
    transition(to, trigger, details) {
        const from = this._state;
        if (from === to)
            return;
        const allowed = this.transitions[from];
        if (allowed && !allowed.includes(to)) {
            log.warn({ from, to, trigger }, 'Invalid state transition attempted');
        }
        const entry = {
            timestamp: new Date().toISOString(),
            from: from,
            to: to,
            trigger,
            details,
        };
        this._timeline.push(entry);
        this._state = to;
        log.info({ from, to, trigger }, `State transition: ${from} → ${to}`);
    }
    reset() {
        this._state = this.transitions['IDLE'] ? 'IDLE' : Object.keys(this.transitions)[0] ?? 'IDLE';
        this._timeline = [];
    }
}
exports.UIStateMachine = UIStateMachine;
//# sourceMappingURL=index.js.map