"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initJobState = initJobState;
exports.getJobState = getJobState;
exports.updateState = updateState;
exports.setSubstate = setSubstate;
exports.updateTiming = updateTiming;
exports.setThinking = setThinking;
exports.setPartialResponse = setPartialResponse;
exports.setProgressText = setProgressText;
exports.setArtifactPath = setArtifactPath;
exports.removeJobState = removeJobState;
const MAX_ENTRIES = 100;
const store = new Map();
function initJobState(jobId, tool, mode) {
    const state = {
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
        if (oldest)
            store.delete(oldest);
    }
    store.set(jobId, state);
    return state;
}
function getJobState(jobId) {
    return store.get(jobId);
}
function updateState(jobId, newState, trigger, details) {
    const s = store.get(jobId);
    if (!s)
        return;
    const transition = {
        timestamp: new Date().toISOString(),
        from: s.state,
        to: newState,
        trigger,
        details,
    };
    s.state_history.push(transition);
    s.state = newState;
}
function setSubstate(jobId, substate) {
    const s = store.get(jobId);
    if (s)
        s.substate = substate;
}
function updateTiming(jobId, updates) {
    const s = store.get(jobId);
    if (!s)
        return;
    Object.assign(s.timing, updates);
}
function setThinking(jobId, thinking) {
    const s = store.get(jobId);
    if (s)
        s.thinking = thinking;
}
function setPartialResponse(jobId, text) {
    const s = store.get(jobId);
    if (s)
        s.partial_response = text;
}
function setProgressText(jobId, text) {
    const s = store.get(jobId);
    if (s)
        s.progress_text = text;
}
function setArtifactPath(jobId, path) {
    const s = store.get(jobId);
    if (s)
        s.artifact_path = path;
}
function removeJobState(jobId) {
    store.delete(jobId);
}
//# sourceMappingURL=job-state-store.js.map