import { describe, it, expect } from 'vitest';
import { UIStateMachine } from '../src/state-machine/index.js';

describe('UIStateMachine', () => {
  it('starts in IDLE state by default', () => {
    const sm = new UIStateMachine();
    expect(sm.state).toBe('IDLE');
  });

  it('transitions between valid states', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'test');
    expect(sm.state).toBe('TYPING');
    sm.transition('GENERATING', 'test');
    expect(sm.state).toBe('GENERATING');
    sm.transition('DONE', 'test');
    expect(sm.state).toBe('DONE');
  });

  it('records timeline entries', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'test-trigger', 'test detail');
    expect(sm.timeline).toHaveLength(1);
    expect(sm.timeline[0]).toMatchObject({
      from: 'IDLE',
      to: 'TYPING',
      trigger: 'test-trigger',
      details: 'test detail',
    });
  });

  it('ignores same-state transitions', () => {
    const sm = new UIStateMachine();
    sm.transition('IDLE', 'test');
    expect(sm.timeline).toHaveLength(0);
  });

  it('accepts custom transition config', () => {
    const sm = new UIStateMachine({
      transitions: { A: ['B'], B: ['C', 'A'], C: ['A'] },
      initialState: 'A',
    });
    expect(sm.state).toBe('A');
    sm.transition('B', 'test');
    expect(sm.state).toBe('B');
  });

  it('resets to initial state', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'test');
    sm.reset();
    expect(sm.state).toBe('IDLE');
    expect(sm.timeline).toHaveLength(0);
  });
});
