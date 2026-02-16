import type { StateTransition, StateMachineConfig } from '../types.js';
export declare class UIStateMachine {
    private _state;
    private _timeline;
    private transitions;
    constructor(config?: StateMachineConfig);
    get state(): string;
    get timeline(): readonly StateTransition[];
    transition(to: string, trigger: string, details?: string): void;
    reset(): void;
}
//# sourceMappingURL=index.d.ts.map