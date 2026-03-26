/**
 * Unit tests for the job state store.
 */
import { describe, it, expect } from 'vitest';
import { jobStateStore } from '@pingdev/core';

const {
  initJobState,
  getJobState,
  updateState,
  setSubstate,
  updateTiming,
  setThinking,
  setPartialResponse,
  setProgressText,
  removeJobState,
} = jobStateStore;

describe('Job State Store', () => {
  it('should initialize a new job state', () => {
    const state = initJobState('test-1', 'deep_research', 'thinking');
    expect(state.job_id).toBe('test-1');
    expect(state.state).toBe('IDLE');
    expect(state.substate).toBeNull();
    expect(state.tool_used).toBe('deep_research');
    expect(state.mode).toBe('thinking');
    expect(state.timing.queued_at).toBeDefined();
    expect(state.state_history).toHaveLength(0);
    expect(state.thinking).toBe('');
    expect(state.partial_response).toBe('');
  });

  it('should retrieve stored job state', () => {
    initJobState('test-2', null, null);
    const state = getJobState('test-2');
    expect(state).toBeDefined();
    expect(state!.job_id).toBe('test-2');
  });

  it('should return undefined for unknown jobs', () => {
    const state = getJobState('nonexistent');
    expect(state).toBeUndefined();
  });

  it('should update state and record transitions', () => {
    initJobState('test-3', null, null);
    updateState('test-3', 'TYPING', 'type-prompt', 'Typed 42 chars');
    const state = getJobState('test-3')!;
    expect(state.state).toBe('TYPING');
    expect(state.state_history).toHaveLength(1);
    expect(state.state_history[0]!.from).toBe('IDLE');
    expect(state.state_history[0]!.to).toBe('TYPING');
    expect(state.state_history[0]!.trigger).toBe('type-prompt');
    expect(state.state_history[0]!.details).toBe('Typed 42 chars');

    updateState('test-3', 'GENERATING', 'submit');
    expect(state.state_history).toHaveLength(2);
    expect(state.state).toBe('GENERATING');
  });

  it('should set substate', () => {
    initJobState('test-4', 'deep_think', null);
    setSubstate('test-4', 'thinking');
    expect(getJobState('test-4')!.substate).toBe('thinking');
    setSubstate('test-4', null);
    expect(getJobState('test-4')!.substate).toBeNull();
  });

  it('should update timing', () => {
    initJobState('test-5', null, null);
    updateTiming('test-5', { started_at: '2026-01-01T00:00:00Z' });
    expect(getJobState('test-5')!.timing.started_at).toBe('2026-01-01T00:00:00Z');
    updateTiming('test-5', { first_token_at: '2026-01-01T00:00:01Z' });
    expect(getJobState('test-5')!.timing.first_token_at).toBe('2026-01-01T00:00:01Z');
  });

  it('should set thinking content', () => {
    initJobState('test-6', null, null);
    setThinking('test-6', 'Let me think about this...');
    expect(getJobState('test-6')!.thinking).toBe('Let me think about this...');
  });

  it('should set partial response', () => {
    initJobState('test-7', null, null);
    setPartialResponse('test-7', 'The answer is...');
    expect(getJobState('test-7')!.partial_response).toBe('The answer is...');
  });

  it('should set progress text', () => {
    initJobState('test-8', null, null);
    setProgressText('test-8', 'Generating your video...');
    expect(getJobState('test-8')!.progress_text).toBe('Generating your video...');
  });

  it('should remove job state', () => {
    initJobState('test-9', null, null);
    expect(getJobState('test-9')).toBeDefined();
    removeJobState('test-9');
    expect(getJobState('test-9')).toBeUndefined();
  });

  it('should not throw when updating nonexistent job', () => {
    expect(() => updateState('no-such-job', 'TYPING', 'test')).not.toThrow();
    expect(() => setSubstate('no-such-job', 'thinking')).not.toThrow();
    expect(() => setThinking('no-such-job', 'test')).not.toThrow();
  });
});
