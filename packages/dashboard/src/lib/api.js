/** API client for PingDev dashboard — talks to each PingApp's local HTTP API. */
function baseUrl(port) {
    return `/api/${port}`;
}
export async function fetchHealth(port) {
    const res = await fetch(`${baseUrl(port)}/v1/health`);
    if (!res.ok)
        throw new Error(`Health check failed: ${res.status}`);
    return res.json();
}
export async function submitJob(port, prompt, opts) {
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
export async function fetchJob(port, jobId) {
    const res = await fetch(`${baseUrl(port)}/v1/jobs/${jobId}`);
    if (!res.ok)
        throw new Error(`Job fetch failed: ${res.status}`);
    return res.json();
}
export async function fetchJobStatus(port, jobId) {
    const res = await fetch(`${baseUrl(port)}/v1/jobs/${jobId}/status`);
    if (!res.ok)
        throw new Error(`Status fetch failed: ${res.status}`);
    return res.json();
}
export async function sendChat(port, prompt, opts) {
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
export async function fetchTools(port) {
    const res = await fetch(`${baseUrl(port)}/v1/tools`);
    if (!res.ok)
        throw new Error(`Tools fetch failed: ${res.status}`);
    return res.json();
}
/** Subscribe to SSE job stream. Returns a cleanup function. */
export function subscribeJobStream(port, jobId, onEvent, onError) {
    const url = `${baseUrl(port)}/v1/jobs/${jobId}/stream`;
    const source = new EventSource(url);
    const eventTypes = ['state_change', 'partial_response', 'thinking', 'progress', 'complete', 'error'];
    for (const type of eventTypes) {
        source.addEventListener(type, (event) => {
            try {
                const data = JSON.parse(event.data);
                onEvent(type, data);
            }
            catch {
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
const DEFAULT_APPS = [
    { name: 'Gemini', url: 'http://localhost:3456', port: 3456 },
    { name: 'AI Studio', url: 'http://localhost:3457', port: 3457 },
    { name: 'ChatGPT', url: 'http://localhost:3458', port: 3458 },
];
export function loadApps() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const stored = JSON.parse(raw);
            // Merge defaults that aren't already registered (by port)
            const storedPorts = new Set(stored.map(a => a.port));
            for (const def of DEFAULT_APPS) {
                if (!storedPorts.has(def.port))
                    stored.push(def);
            }
            return stored;
        }
    }
    catch { /* ignore */ }
    // First load — seed with defaults
    saveApps(DEFAULT_APPS);
    return [...DEFAULT_APPS];
}
export function saveApps(apps) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
    // Same-tab notification for UI (storage event does not fire in same document).
    window.dispatchEvent(new Event('pingdev-apps-changed'));
}
export function addApp(app) {
    const apps = loadApps();
    const existing = apps.findIndex(a => a.port === app.port);
    if (existing >= 0) {
        apps[existing] = app;
    }
    else {
        apps.push(app);
    }
    saveApps(apps);
    return apps;
}
export function removeApp(port) {
    const apps = loadApps().filter(a => a.port !== port);
    saveApps(apps);
    return apps;
}
//# sourceMappingURL=api.js.map