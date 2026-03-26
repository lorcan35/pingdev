import type { StateMachineConfig } from '@pingdev/core';

export const stateConfig: StateMachineConfig = {
  transitions: {
    IDLE: ['TYPING', 'NEEDS_HUMAN'],
    TYPING: ['GENERATING', 'IDLE', 'FAILED', 'NEEDS_HUMAN'],
    GENERATING: ['DONE', 'FAILED', 'NEEDS_HUMAN'],
    DONE: ['IDLE'],
    FAILED: ['IDLE'],
    NEEDS_HUMAN: ['IDLE'],
  },
  initialState: 'IDLE',
};
