import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../src/worker/job-state-store.js';

describe('JobStateStore', () => {
  beforeEach(() => {
    // Clean up any previous state
    store.removeJobState('test-job-1');
    store.removeJobState('test-job-2');
  });

  it('initializes job state', () => {
    const state = store.initJobState('test-job-1', 'tool1', 'mode1');
    expect(state.job_id).toBe('test-job-1');
    expect(state.state).toBe('IDLE');
    expect(state.tool_used).toBe('tool1');
    expect(state.mode).toBe('mode1');
  });

  it('retrieves job state', () => {
    store.initJobState('test-job-1', null, null);
    const state = store.getJobState('test-job-1');
    expect(state).toBeDefined();
    expect(state!.job_id).toBe('test-job-1');
  });

  it('returns undefined for unknown jobs', () => {
    expect(store.getJobState('nonexistent')).toBeUndefined();
  });

  it('updates state and records transitions', () => {
    store.initJobState('test-job-1', null, null);
    store.updateState('test-job-1', 'TYPING', 'type-prompt');
    const state = store.getJobState('test-job-1');
    expect(state!.state).toBe('TYPING');
    expect(state!.state_history).toHaveLength(1);
    expect(state!.state_history[0]).toMatchObject({
      from: 'IDLE',
      to: 'TYPING',
      trigger: 'type-prompt',
    });
  });

  it('sets substate', () => {
    store.initJobState('test-job-1', null, null);
    store.setSubstate('test-job-1', 'researching');
    expect(store.getJobState('test-job-1')!.substate).toBe('researching');
  });

  it('updates timing', () => {
    store.initJobState('test-job-1', null, null);
    store.updateTiming('test-job-1', { started_at: '2025-01-01T00:00:00Z' });
    expect(store.getJobState('test-job-1')!.timing.started_at).toBe('2025-01-01T00:00:00Z');
  });

  it('sets partial response and thinking', () => {
    store.initJobState('test-job-1', null, null);
    store.setPartialResponse('test-job-1', 'Hello');
    store.setThinking('test-job-1', 'I am thinking');
    const state = store.getJobState('test-job-1')!;
    expect(state.partial_response).toBe('Hello');
    expect(state.thinking).toBe('I am thinking');
  });

  it('removes job state', () => {
    store.initJobState('test-job-1', null, null);
    store.removeJobState('test-job-1');
    expect(store.getJobState('test-job-1')).toBeUndefined();
  });
});
