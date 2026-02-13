import type { UIState, StateTransition, StateMachineConfig } from '../types.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'state-machine' });

/** Default valid transitions. */
const DEFAULT_TRANSITIONS: Record<string, string[]> = {
  IDLE: ['TYPING', 'NEEDS_HUMAN'],
  TYPING: ['GENERATING', 'IDLE', 'FAILED', 'NEEDS_HUMAN'],
  GENERATING: ['DONE', 'FAILED', 'NEEDS_HUMAN'],
  DONE: ['IDLE'],
  FAILED: ['IDLE'],
  NEEDS_HUMAN: ['IDLE'],
};

export class UIStateMachine {
  private _state: string;
  private _timeline: StateTransition[] = [];
  private transitions: Record<string, string[]>;

  constructor(config?: StateMachineConfig) {
    this._state = config?.initialState ?? 'IDLE';
    this.transitions = config?.transitions ?? DEFAULT_TRANSITIONS;
  }

  get state(): string {
    return this._state;
  }

  get timeline(): readonly StateTransition[] {
    return this._timeline;
  }

  transition(to: string, trigger: string, details?: string): void {
    const from = this._state;
    if (from === to) return;

    const allowed = this.transitions[from];
    if (allowed && !allowed.includes(to)) {
      log.warn({ from, to, trigger }, 'Invalid state transition attempted');
    }

    const entry: StateTransition = {
      timestamp: new Date().toISOString(),
      from: from as UIState,
      to: to as UIState,
      trigger,
      details,
    };

    this._timeline.push(entry);
    this._state = to;
    log.info({ from, to, trigger }, `State transition: ${from} → ${to}`);
  }

  reset(): void {
    this._state = this.transitions['IDLE'] ? 'IDLE' : Object.keys(this.transitions)[0] ?? 'IDLE';
    this._timeline = [];
  }
}
