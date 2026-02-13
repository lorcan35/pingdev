import type { UIState, UISubstate, LiveJobState, StateTransition, JobTiming } from '../types.js';

const MAX_ENTRIES = 100;
const store = new Map<string, LiveJobState>();

export function initJobState(
  jobId: string,
  tool: string | null,
  mode: string | null,
): LiveJobState {
  const state: LiveJobState = {
    job_id: jobId,
    state: 'IDLE',
    substate: null,
    timing: { queued_at: new Date().toISOString() },
    state_history: [],
    thinking: '',
    partial_response: '',
    progress_text: '',
    tool_used: tool,
    mode: mode,
  };

  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  store.set(jobId, state);
  return state;
}

export function getJobState(jobId: string): LiveJobState | undefined {
  return store.get(jobId);
}

export function updateState(jobId: string, newState: UIState, trigger: string, details?: string): void {
  const s = store.get(jobId);
  if (!s) return;

  const transition: StateTransition = {
    timestamp: new Date().toISOString(),
    from: s.state as UIState,
    to: newState,
    trigger,
    details,
  };
  s.state_history.push(transition);
  s.state = newState;
}

export function setSubstate(jobId: string, substate: UISubstate): void {
  const s = store.get(jobId);
  if (s) s.substate = substate;
}

export function updateTiming(jobId: string, updates: Partial<JobTiming>): void {
  const s = store.get(jobId);
  if (!s) return;
  Object.assign(s.timing, updates);
}

export function setThinking(jobId: string, thinking: string): void {
  const s = store.get(jobId);
  if (s) s.thinking = thinking;
}

export function setPartialResponse(jobId: string, text: string): void {
  const s = store.get(jobId);
  if (s) s.partial_response = text;
}

export function setProgressText(jobId: string, text: string): void {
  const s = store.get(jobId);
  if (s) s.progress_text = text;
}

export function setArtifactPath(jobId: string, path: string): void {
  const s = store.get(jobId);
  if (s) s.artifact_path = path;
}

export function removeJobState(jobId: string): void {
  store.delete(jobId);
}
