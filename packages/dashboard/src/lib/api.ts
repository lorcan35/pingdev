/** API client for PingDev dashboard — talks to each PingApp's local HTTP API. */

export interface PingAppConfig {
  name: string;
  url: string;
  port: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  browser: { connected: boolean; page_loaded: boolean };
  queue: { waiting: number; active: number; completed: number; failed: number };
  worker: { running: boolean; current_job?: string };
  timestamp: string;
}

export interface JobResponse {
  job_id: string;
  status: string;
  created_at: string;
  prompt: string;
  response?: string;
  error?: { code: string; message: string; retryable: boolean };
  thinking?: string;
  timing?: {
    queued_at: string;
    started_at?: string;
    first_token_at?: string;
    completed_at?: string;
    total_ms?: number;
  };
  state_history?: Array<{
    timestamp: string;
    from: string;
    to: string;
    trigger: string;
    details?: string;
  }>;
  tool_used?: string | null;
  mode?: string | null;
  conversation_id?: string;
  artifact_path?: string;
}

export interface JobStatusResponse {
  job_id: string;
  bull_state: string;
  ui_state: string;
  substate: string | null;
  elapsed_in_state_ms: number;
  thinking: string;
  progress_text: string;
  partial_response: string;
  timing: JobResponse['timing'];
  state_history: NonNullable<JobResponse['state_history']>;
  tool_used: string | null;
  mode: string | null;
}

export interface ChatResponse extends JobResponse {
  cached?: boolean;
}

export interface ToolsResponse {
  tools: Array<{ name: string; description?: string }>;
}

function baseUrl(port: number): string {
  return `/api/${port}`;
}

export async function fetchHealth(port: number): Promise<HealthResponse> {
  const res = await fetch(`${baseUrl(port)}/v1/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function submitJob(port: number, prompt: string, opts?: { tool?: string; mode?: string; timeout_ms?: number }): Promise<{ job_id: string; status: string; created_at: string }> {
  const res = await fetch(`${baseUrl(port)}/v1/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...opts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Submit failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchJob(port: number, jobId: string): Promise<JobResponse> {
  const res = await fetch(`${baseUrl(port)}/v1/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Job fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchJobStatus(port: number, jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${baseUrl(port)}/v1/jobs/${jobId}/status`);
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  return res.json();
}

export async function sendChat(port: number, prompt: string, opts?: { tool?: string; mode?: string; timeout_ms?: number }): Promise<ChatResponse> {
  const res = await fetch(`${baseUrl(port)}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, timeout_ms: opts?.timeout_ms ?? 120_000, ...opts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Chat failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTools(port: number): Promise<ToolsResponse> {
  const res = await fetch(`${baseUrl(port)}/v1/tools`);
  if (!res.ok) throw new Error(`Tools fetch failed: ${res.status}`);
  return res.json();
}

/** Subscribe to SSE job stream. Returns a cleanup function. */
export function subscribeJobStream(
  port: number,
  jobId: string,
  onEvent: (type: string, data: Record<string, unknown>) => void,
  onError?: (err: Error) => void,
): () => void {
  const url = `${baseUrl(port)}/v1/jobs/${jobId}/stream`;
  const source = new EventSource(url);

  const eventTypes = ['state_change', 'partial_response', 'thinking', 'progress', 'complete', 'error'];
  for (const type of eventTypes) {
    source.addEventListener(type, (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(type, data);
      } catch {
        onEvent(type, { raw: event.data });
      }
    });
  }

  source.onerror = () => {
    onError?.(new Error('SSE connection error'));
    source.close();
  };

  return () => source.close();
}

/** Default PingApp registry — loaded from localStorage, seeded with known apps. */
const STORAGE_KEY = 'pingdev-apps';

const DEFAULT_APPS: PingAppConfig[] = [
  { name: 'Gemini', url: 'http://localhost:3456', port: 3456 },
  { name: 'AI Studio', url: 'http://localhost:3457', port: 3457 },
  { name: 'ChatGPT', url: 'http://localhost:3458', port: 3458 },
];

export function loadApps(): PingAppConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored: PingAppConfig[] = JSON.parse(raw);
      // Merge defaults that aren't already registered (by port)
      const storedPorts = new Set(stored.map(a => a.port));
      for (const def of DEFAULT_APPS) {
        if (!storedPorts.has(def.port)) stored.push(def);
      }
      return stored;
    }
  } catch { /* ignore */ }
  // First load — seed with defaults
  saveApps(DEFAULT_APPS);
  return [...DEFAULT_APPS];
}

export function saveApps(apps: PingAppConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  // Same-tab notification for UI (storage event does not fire in same document).
  window.dispatchEvent(new Event('pingdev-apps-changed'));
}

export function addApp(app: PingAppConfig): PingAppConfig[] {
  const apps = loadApps();
  const existing = apps.findIndex(a => a.port === app.port);
  if (existing >= 0) {
    apps[existing] = app;
  } else {
    apps.push(app);
  }
  saveApps(apps);
  return apps;
}

export function removeApp(port: number): PingAppConfig[] {
  const apps = loadApps().filter(a => a.port !== port);
  saveApps(apps);
  return apps;
}
