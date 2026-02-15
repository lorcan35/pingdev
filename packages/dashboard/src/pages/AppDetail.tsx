import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJob, fetchTools, sendChat, submitJob, type JobResponse, type PingAppConfig } from '../lib/api';
import { useApps } from '../hooks/useApps';
import { useHealth } from '../hooks/useHealth';
import { useSSE } from '../hooks/useSSE';
import { useActivity } from '../components/Activity';
import { useToast } from '../components/Toasts';
import { HealthPulse, QueueFlow } from '../components/AppViz';

export function AppDetailPage() {
  const { port: portStr } = useParams<{ port: string }>();
  const port = parseInt(portStr ?? '0', 10);
  const { apps } = useApps();
  const app = apps.find(a => a.port === port) ?? null;

  if (!app) {
    return (
      <div className="page">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">App not found</div>
            <div className="panel-sub">No PingApp registered on port {port}.</div>
          </div>
          <div className="empty">
            <div className="empty-title">Missing registry entry</div>
            <div className="empty-sub">Return to Apps and register it again.</div>
            <Link className="btn primary" to="/">Back to Apps</Link>
          </div>
        </div>
      </div>
    );
  }

  return <AppDetailInner app={app} />;
}

function AppDetailInner({ app }: { app: PingAppConfig }) {
  const { push } = useActivity();
  const { toast } = useToast();
  const { health, error, loading, refresh } = useHealth(app.port, 2500);
  const [tools, setTools] = useState<Array<{ name: string; description?: string }>>([]);

  useEffect(() => {
    fetchTools(app.port)
      .then(r => setTools(r.tools ?? []))
      .catch(() => setTools([]));
  }, [app.port]);

  const status = health?.status ?? (error ? 'offline' : loading ? 'loading' : 'offline');
  const q = health?.queue ?? { waiting: 0, active: 0, completed: 0, failed: 0 };

  return (
    <div className="page">
      <div className="hero tight">
        <div className="hero-main">
          <div className="breadcrumbs">
            <Link to="/" className="crumb">Apps</Link>
            <span className="crumb-sep">/</span>
            <span className="crumb-cur">{app.name}</span>
            <span className="crumb-port">:{app.port}</span>
          </div>
          <div className="hsub mono dim">{app.url}</div>
        </div>
        <div className="hero-actions">
          <button className="btn subtle" onClick={refresh}>Refresh</button>
          <button
            className="btn subtle"
            onClick={async () => {
              await navigator.clipboard.writeText(app.url);
              toast({ intent: 'good', title: 'Copied', message: app.url });
            }}
          >
            Copy URL
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="col">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Health</div>
              <div className="panel-sub">Live status + queue</div>
            </div>

            <div className="health-row">
              <HealthPulse status={status as any} />
              <div className="health-meta">
                <div className="health-status">
                  <span className={`badge ${status === 'healthy' ? 'good' : status === 'degraded' ? 'warn' : status === 'unhealthy' ? 'bad' : status === 'loading' ? 'muted' : 'bad'}`}>
                    {status}
                  </span>
                  {error && <span className="mono dim">{error}</span>}
                </div>
                <div className="health-flags">
                  <span className={`badge ${health?.browser?.connected ? 'good' : 'bad'}`}>browser {health?.browser?.connected ? 'up' : 'down'}</span>
                  <span className={`badge ${health?.worker?.running ? 'info' : 'muted'}`}>worker {health?.worker?.running ? 'running' : 'idle'}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <QueueFlow waiting={q.waiting} active={q.active} completed={q.completed} failed={q.failed} />
            </div>
          </div>

          <ToolShelf tools={tools} />

          <JobConsole
            port={app.port}
            tools={tools}
            onSignal={(lvl, msg, meta) => push({ level: lvl, kind: 'job', appName: app.name, appPort: app.port, message: msg, meta })}
            onToast={(intent, title, message) => toast({ intent, title, message })}
          />
        </div>

        <div className="col">
          <LivePanels port={app.port} />
        </div>
      </div>
    </div>
  );
}

function ToolShelf({ tools }: { tools: Array<{ name: string; description?: string }> }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Tools</div>
        <div className="panel-sub">{tools.length ? `${tools.length} exposed endpoint tools` : 'No tools endpoint or unavailable'}</div>
      </div>
      {tools.length === 0 ? (
        <div className="empty mini">
          <div className="empty-title">No tool metadata</div>
          <div className="empty-sub">This PingApp may not expose `/v1/tools` yet.</div>
        </div>
      ) : (
        <div className="tool-grid">
          {tools.map(t => (
            <div key={t.name} className="tool">
              <div className="tool-name">{t.name}</div>
              <div className="tool-desc">{t.description ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobConsole({
  port,
  tools,
  onSignal,
  onToast,
}: {
  port: number;
  tools: Array<{ name: string; description?: string }>;
  onSignal: (lvl: 'info' | 'good' | 'warn' | 'bad', msg: string, meta?: Record<string, unknown>) => void;
  onToast: (intent: 'info' | 'good' | 'warn' | 'bad', title: string, message?: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [tool, setTool] = useState('');
  const [mode, setMode] = useState('');
  const [useSync, setUseSync] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ jobId: string; ts: number; status: string }>>([]);

  const { events, connected, connect, disconnect } = useSSE(port, activeJobId);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [events]);

  useEffect(() => {
    const done = events.find(e => e.type === 'complete');
    const failed = events.find(e => e.type === 'error');
    if (!activeJobId) return;
    if (!done && !failed) return;
    fetchJob(port, activeJobId)
      .then(r => {
        setResult(r);
        setRecent(prev => [{ jobId: activeJobId, ts: Date.now(), status: r.status }, ...prev].slice(0, 12));
        const intent = r.status === 'done' ? 'good' : r.status === 'failed' ? 'bad' : 'info';
        onToast(intent as any, `Job ${r.status}`, activeJobId);
        onSignal(intent as any, `Job ${r.status}`, { job_id: activeJobId });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, activeJobId, port]);

  async function submit() {
    if (!prompt.trim() || sending) return;
    setSending(true);
    setErr(null);
    setResult(null);
    disconnect();
    setActiveJobId(null);

    const opts: { tool?: string; mode?: string } = {};
    if (tool.trim()) opts.tool = tool.trim();
    if (mode.trim()) opts.mode = mode.trim();

    try {
      if (useSync) {
        onSignal('info', 'Sending sync chat…');
        const res = await sendChat(port, prompt.trim(), Object.keys(opts).length ? opts : undefined);
        setResult(res);
        setRecent(prev => [{ jobId: res.job_id, ts: Date.now(), status: res.status }, ...prev].slice(0, 12));
        onToast(res.status === 'done' ? 'good' : 'info', 'Chat complete', `${(res.response ?? '').slice(0, 40)}…`);
        return;
      }

      const { job_id } = await submitJob(port, prompt.trim(), Object.keys(opts).length ? opts : undefined);
      setActiveJobId(job_id);
      setRecent(prev => [{ jobId: job_id, ts: Date.now(), status: 'queued' }, ...prev].slice(0, 12));
      onSignal('info', 'Job submitted', { job_id });
      onToast('info', 'Job queued', job_id);

      window.setTimeout(() => connect(), 200);

      // Safety poll: if SSE fails, we still converge.
      (async () => {
        for (let i = 0; i < 150; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const job = await fetchJob(port, job_id);
            if (job.status === 'done' || job.status === 'failed') {
              setResult(job);
              return;
            }
          } catch {
            // ignore
          }
        }
      })();
    } catch (e) {
      setErr(String(e));
      onToast('bad', 'Submit failed', String(e));
      onSignal('bad', 'Submit failed', { error: String(e) });
    } finally {
      setSending(false);
    }
  }

  const hintedTools = useMemo(() => tools.slice(0, 8), [tools]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Console</div>
        <div className="panel-sub">Submit jobs + watch the stream</div>
      </div>

      <div className="console">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Write a prompt. Cmd/Ctrl+Enter to run."
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
        />

        <div className="console-row">
          <div className="pillrow">
            {hintedTools.map(t => (
              <button
                key={t.name}
                className={`pill ${tool === t.name ? 'on' : ''}`}
                onClick={() => setTool(prev => (prev === t.name ? '' : t.name))}
                title={t.description ?? t.name}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="console-actions">
            {connected ? (
              <button className="btn subtle" onClick={disconnect}>Stop Stream</button>
            ) : (
              <span className="badge muted">SSE {activeJobId ? 'ready' : 'idle'}</span>
            )}
            <button className="btn primary" disabled={!prompt.trim() || sending} onClick={submit}>
              {sending ? 'Sending…' : useSync ? 'Chat' : 'Run'}
            </button>
          </div>
        </div>

        <div className="console-row">
          <label className="check">
            <input type="checkbox" checked={useSync} onChange={e => setUseSync(e.target.checked)} />
            <span>Use sync `/v1/chat`</span>
          </label>
          <div className="mini-fields">
            <input value={tool} onChange={e => setTool(e.target.value)} placeholder="tool (optional)" />
            <input value={mode} onChange={e => setMode(e.target.value)} placeholder="mode (optional)" />
          </div>
        </div>

        {err && <div className="callout bad">{err}</div>}

        {(events.length > 0 || activeJobId) && (
          <div className="stream">
            <div className="stream-head">
              <div className="stream-title">Stream</div>
              <div className="stream-sub mono dim">
                {activeJobId ? `${activeJobId.slice(0, 8)}…` : '—'}
                {connected && <span className="badge good" style={{ marginLeft: 8 }}>LIVE</span>}
              </div>
            </div>
            <div className="stream-box" ref={streamRef}>
              {events.map((evt, i) => (
                <div key={i} className="evt">
                  <span className="evt-type">{evt.type}</span>
                  <span className="evt-ts">{new Date(evt.receivedAt).toLocaleTimeString(undefined, { hour12: false })}</span>
                  <div className="evt-body">
                    {evt.type === 'partial_response'
                      ? String((evt.data as any).text ?? '').slice(0, 400)
                      : JSON.stringify(evt.data).slice(0, 400)}
                  </div>
                </div>
              ))}
              {events.length === 0 && <div className="dim">Waiting for events…</div>}
            </div>
          </div>
        )}

        {result && (
          <div className="result">
            <div className="result-head">
              <div className="result-title">Result</div>
              <div className="result-meta">
                <span className={`badge ${result.status === 'done' ? 'good' : result.status === 'failed' ? 'bad' : 'warn'}`}>{result.status}</span>
                {result.timing?.total_ms != null && (
                  <span className="badge info">{(result.timing.total_ms / 1000).toFixed(1)}s</span>
                )}
              </div>
            </div>
            <div className="result-box">
              {result.response ?? result.error?.message ?? 'No response'}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="recent">
            <div className="panel-title" style={{ marginBottom: 8 }}>Recent</div>
            <div className="recent-list">
              {recent.map(r => (
                <button
                  key={r.jobId}
                  className="recent-item"
                  onClick={async () => {
                    await navigator.clipboard.writeText(r.jobId);
                    onToast('good', 'Copied job id', r.jobId);
                  }}
                  title="Click to copy job id"
                >
                  <span className="mono acc">{r.jobId.slice(0, 8)}…</span>
                  <span className="dim">{r.status}</span>
                  <span className="dim">{new Date(r.ts).toLocaleTimeString(undefined, { hour12: false })}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LivePanels({ port }: { port: number }) {
  // This column is meant to feel like "instruments": quick glance at global activity.
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Notes</div>
          <div className="panel-sub">What this agent exposes today</div>
        </div>
        <div className="callout">
          <div className="mono dim">Endpoints</div>
          <div className="mono">GET /v1/health</div>
          <div className="mono">POST /v1/jobs</div>
          <div className="mono">GET /v1/jobs/:id</div>
          <div className="mono">GET /v1/jobs/:id/status</div>
          <div className="mono">GET /v1/jobs/:id/stream</div>
          <div className="mono">POST /v1/chat</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Port Proxy</div>
          <div className="panel-sub">Vite forwards `/api/{port}/*`</div>
        </div>
        <div className="callout">
          <div className="mono dim">Base</div>
          <div className="mono acc">/api/{port}</div>
        </div>
      </div>
    </div>
  );
}

