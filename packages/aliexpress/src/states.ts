import type { StateMachineConfig } from '@pingdev/core';

export const stateConfig: StateMachineConfig = {
  transitions: {
    'idle': ['loading'],
    'loading': ['done'],
    'done': ['idle', 'loading'],
  },
  initialState: 'IDLE',
};
