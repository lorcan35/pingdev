/**
 * Unit tests for the UI State Machine.
 */
import { describe, it, expect } from 'vitest';
import { UIStateMachine } from '@pingdev/core';

describe('UIStateMachine', () => {
  it('should start in IDLE state', () => {
    const sm = new UIStateMachine();
    expect(sm.state).toBe('IDLE');
  });

  it('should transition IDLE → TYPING → GENERATING → DONE', () => {
    const sm = new UIStateMachine();

    sm.transition('TYPING', 'type-prompt', 'User typed');
    expect(sm.state).toBe('TYPING');

    sm.transition('GENERATING', 'submit', 'Enter pressed');
    expect(sm.state).toBe('GENERATING');

    sm.transition('DONE', 'response-stable', 'Response extracted');
    expect(sm.state).toBe('DONE');
  });

  it('should record timeline entries', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'type-prompt');
    sm.transition('GENERATING', 'submit');

    expect(sm.timeline).toHaveLength(2);
    expect(sm.timeline[0]!.from).toBe('IDLE');
    expect(sm.timeline[0]!.to).toBe('TYPING');
    expect(sm.timeline[1]!.from).toBe('TYPING');
    expect(sm.timeline[1]!.to).toBe('GENERATING');
  });

  it('should handle GENERATING → FAILED transition', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'type-prompt');
    sm.transition('GENERATING', 'submit');
    sm.transition('FAILED', 'timeout', 'Generation timed out');

    expect(sm.state).toBe('FAILED');
  });

  it('should handle ANY → NEEDS_HUMAN transition', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'type-prompt');
    sm.transition('NEEDS_HUMAN', 'auth-challenge', 'Captcha detected');

    expect(sm.state).toBe('NEEDS_HUMAN');
  });

  it('should be a no-op for same-state transitions', () => {
    const sm = new UIStateMachine();
    sm.transition('IDLE', 'noop');
    expect(sm.timeline).toHaveLength(0);
  });

  it('should reset to IDLE', () => {
    const sm = new UIStateMachine();
    sm.transition('TYPING', 'type');
    sm.transition('GENERATING', 'submit');
    sm.reset();

    expect(sm.state).toBe('IDLE');
    expect(sm.timeline).toHaveLength(0);
  });
});
