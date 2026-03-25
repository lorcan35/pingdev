/**
 * Gateway API client — comprehensive wrapper for all PingOS gateway endpoints.
 * Proxied via Vite dev server: /gw → http://localhost:3500
 */

const GW = '/gw';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${GW}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GW}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `POST ${path} → ${res.status}`);
  }
  return res.json();
}

async function del<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${GW}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Device {
  deviceId: string;
  tabId: number;
  url: string;
  title?: string;
}

export interface DevicesResponse {
  extension: {
    clients: Array<{ clientId: string; tabs: Device[] }>;
    devices: Device[];
  };
}

export interface HealthResponse {
  status: string;
  version?: string;
  uptime?: number;
  gateway?: boolean;
  extension?: boolean;
  llm?: boolean;
}

export interface HealStats {
  totalAttempts: number;
  successes: number;
  failures: number;
  cacheHits: number;
  avgConfidence: number;
}

export interface HealCacheEntry {
  original: string;
  healed: string;
  confidence: number;
  timestamp: number;
  op?: string;
}

export interface WatchInfo {
  watchId: string;
  deviceId: string;
  selector: string;
  fields?: Record<string, string>;
  interval?: number;
  createdAt?: string;
}

export interface PingAppDef {
  name: string;
  description: string;
  functions: Array<{
    name: string;
    description: string;
    method: string;
    path: string;
    params?: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  }>;
}

export interface ExtractResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AuthResult {
  ok: boolean;
  alreadyAuthenticated?: boolean;
  finalUrl?: string;
  selectedEmail?: string;
  detail?: string;
  error?: string;
  deviceId?: string;
}

export interface AuthCheckResult {
  ok: boolean;
  authenticated: boolean;
  email?: string;
  detail?: string;
}

export interface TemplateInfo {
  domain: string;
  fields: Record<string, string>;
  learnedAt?: string;
}

export interface FunctionDef {
  name: string;
  description: string;
  method: string;
  path: string;
  params?: Array<{ name: string; type: string; required?: boolean; description?: string }>;
}

export interface RecordingInfo {
  id: string;
  url: string;
  actionCount: number;
  startedAt: number;
}

export interface LLMModel {
  id: string;
  name?: string;
  provider?: string;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export const health = () => get<HealthResponse>('/v1/health');
export const devices = () => get<DevicesResponse>('/v1/devices');
export const registry = () => get<any>('/v1/registry');

// ---------------------------------------------------------------------------
// Heal
// ---------------------------------------------------------------------------

export const healCache = () => get<Record<string, HealCacheEntry>>('/v1/heal/cache');
export const healStats = () => get<HealStats>('/v1/heal/stats');

// ---------------------------------------------------------------------------
// Devices — ops
// ---------------------------------------------------------------------------

export function devOp(deviceId: string, op: string, payload: Record<string, unknown> = {}) {
  return post<any>(`/v1/dev/${encodeURIComponent(deviceId)}/${op}`, payload);
}

export const screenshot = (deviceId: string) => devOp(deviceId, 'screenshot');
export const recon = (deviceId: string) => devOp(deviceId, 'recon');
export const discover = (deviceId: string, query?: string) =>
  query ? post<any>(`/v1/dev/${encodeURIComponent(deviceId)}/discover`, { query }) : get<any>(`/v1/dev/${encodeURIComponent(deviceId)}/discover`);
export const read = (deviceId: string, selector: string) => devOp(deviceId, 'read', { selector });
export const click = (deviceId: string, selector: string) => devOp(deviceId, 'click', { selector });
export const type_ = (deviceId: string, text: string, selector?: string) => devOp(deviceId, 'type', { text, selector });
export const press = (deviceId: string, key: string) => devOp(deviceId, 'press', { key });
export const scroll = (deviceId: string, direction?: string, amount?: number) => devOp(deviceId, 'scroll', { direction, amount });
export const navigate = (deviceId: string, url: string) => devOp(deviceId, 'navigate', { url });
export const evalJs = (deviceId: string, expression: string) => devOp(deviceId, 'eval', { expression });
export const act = (deviceId: string, instruction: string) => devOp(deviceId, 'act', { instruction });
export const query = (deviceId: string, question: string) => devOp(deviceId, 'query', { question });
export const extract = (deviceId: string, payload: Record<string, unknown>) => devOp(deviceId, 'extract', payload);
export const extractSemantic = (deviceId: string, query: string, limit?: number) =>
  post<any>(`/v1/dev/${encodeURIComponent(deviceId)}/extract/semantic`, { query, limit });
export const clean = (deviceId: string) => devOp(deviceId, 'clean');
export const highlight = (deviceId: string, selector: string) => devOp(deviceId, 'highlight', { selector });
export const annotate = (deviceId: string, annotations: unknown[]) => devOp(deviceId, 'annotate', { annotations });
export const capture = (deviceId: string, format: string) => devOp(deviceId, 'capture', { format });
export const table = (deviceId: string, selector?: string) => devOp(deviceId, 'table', { selector });
export const network = (deviceId: string, action: string, filter?: string) => devOp(deviceId, 'network', { action, filter });
export const storage = (deviceId: string, action: string, store?: string, key?: string) => devOp(deviceId, 'storage', { action, store, key });

// ---------------------------------------------------------------------------
// Watches
// ---------------------------------------------------------------------------

export const listWatches = () => get<{ watches: WatchInfo[] }>('/v1/watches');
export const startWatch = (deviceId: string, selector: string, fields?: Record<string, string>, interval?: number) =>
  post<{ watchId: string; streamUrl: string }>(`/v1/dev/${encodeURIComponent(deviceId)}/watch/start`, { selector, fields, interval });
export const stopWatch = (watchId: string) => del<any>(`/v1/watches/${encodeURIComponent(watchId)}`);

export function subscribeWatch(watchId: string, onEvent: (data: any) => void): () => void {
  const source = new EventSource(`${GW}/v1/watches/${encodeURIComponent(watchId)}/events`);
  source.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { onEvent(e.data); }
  };
  source.onerror = () => source.close();
  return () => source.close();
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const listTemplates = () => get<{ templates: TemplateInfo[] }>('/v1/templates');
export const getTemplate = (domain: string) => get<TemplateInfo>(`/v1/templates/${encodeURIComponent(domain)}`);
export const deleteTemplate = (domain: string) => del<any>(`/v1/templates/${encodeURIComponent(domain)}`);
export const importTemplate = (template: unknown) => post<any>('/v1/templates/import', template);
export const exportTemplate = (domain: string) => get<any>(`/v1/templates/${encodeURIComponent(domain)}/export`);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export const listFunctions = () => get<Record<string, FunctionDef[]>>('/v1/functions');
export const appFunctions = (app: string) => get<FunctionDef[]>(`/v1/functions/${encodeURIComponent(app)}`);
export const callFunction = (app: string, fn: string, params?: Record<string, unknown>) =>
  post<any>(`/v1/functions/${encodeURIComponent(app)}/call`, { function: fn, params });
export const batchFunctions = (app: string, calls: Array<{ function: string; params?: Record<string, unknown> }>) =>
  post<any>(`/v1/functions/${encodeURIComponent(app)}/batch`, { calls });

// ---------------------------------------------------------------------------
// PingApps
// ---------------------------------------------------------------------------

export const listApps = () => get<PingAppDef[]>('/v1/apps');
export const generateApp = (url: string, description: string) => post<any>('/v1/apps/generate', { url, description });

// PingApp-specific actions
export const appAction = (app: string, action: string, payload?: Record<string, unknown>) =>
  payload ? post<any>(`/v1/app/${app}/${action}`, payload) : get<any>(`/v1/app/${app}/${action}`);

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

export const listRecordings = () => get<{ recordings: RecordingInfo[] }>('/v1/recordings');
export const startRecording = (deviceId: string) => post<any>('/v1/record/start', { deviceId });
export const stopRecording = () => post<any>('/v1/record/stop');
export const replayRecording = (recording: unknown) => post<any>('/v1/recordings/replay', { recording });
export const generateFromRecording = (recording: unknown) => post<any>('/v1/recordings/generate', { recording });
export const exportRecording = (name?: string) => post<any>('/v1/record/export', { name });

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const listPipelines = () => get<any>('/v1/pipelines');
export const runPipeline = (definition: unknown) => post<any>('/v1/pipelines/run', definition);
export const runPipe = (pipe: string) => post<any>('/v1/pipelines/pipe', { pipe });

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

export const llmModels = () => get<{ models: LLMModel[] }>('/v1/llm/models');
export const llmPrompt = (prompt: string, opts?: Record<string, unknown>) =>
  post<any>('/v1/dev/llm/prompt', { prompt, ...opts });
export const llmChat = (messages: Array<{ role: string; content: string }>, opts?: Record<string, unknown>) =>
  post<any>('/v1/dev/llm/chat', { messages, ...opts });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const googleAuth = (deviceId: string, email?: string, timeoutMs?: number) =>
  post<AuthResult>('/v1/auth/google', { deviceId, email, timeoutMs });
export const googleAuthCheck = (deviceId: string) =>
  post<AuthCheckResult>('/v1/auth/google/check', { deviceId });
export const googleAuthAuto = (domain: string, email?: string, timeoutMs?: number) =>
  post<AuthResult>('/v1/auth/google/auto', { domain, email, timeoutMs });

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export const diff = (deviceId: string, schema?: unknown) =>
  post<any>(`/v1/dev/${encodeURIComponent(deviceId)}/diff`, { schema });
