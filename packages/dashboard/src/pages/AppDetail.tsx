import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadApps, submitJob, fetchJob, type PingAppConfig, type JobResponse } from '../lib/api';
import { useHealth } from '../hooks/useHealth';
import { useSSE } from '../hooks/useSSE';

export function AppDetailPage() {
  const { port: portStr } = useParams<{ port: string }>();
  const port = parseInt(portStr ?? '0', 10);
  const [app, setApp] = useState<PingAppConfig | null>(null);

  useEffect(() => {
    const apps = loadApps();
    setApp(apps.find(a => a.port === port) ?? null);
  }, [port]);

  if (!app) {
    return (
      <div className="empty-state">
        <h3>App not found</h3>
        <p>No PingApp registered on port {port}</p>
        <Link to="/" className="btn" style={{ marginTop: 16, display: 'inline-flex' }}>Back to Apps</Link>
      </div>
    );
  }

  return (
    <div className="gap-16">
      <div className="page-header">
        <div className="flex-row">
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Apps</Link>
          <span className="muted">/</span>
          <h1>{app.name} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>:{app.port}</span></h1>
        </div>
        <p>{app.url}</p>
      </div>

      <HealthSection port={port} />
      <PromptSection port={port} />
      <RecentJobsSection port={port} />
    </div>
  );
}

function HealthSection({ port }: { port: number }) {
  const { health, error, loading, refresh } = useHealth(port, 10_000);

  if (loading) return <div className="card"><span className="muted">Checking health...</span></div>;
  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Health</span>
          <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={refresh}>Refresh</button>
        </div>
        <div className="flex-row">
          <span className="status-dot offline" />
          <span style={{ color: 'var(--red)' }}>Offline — {error}</span>
        </div>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex-row">
          <span className={`status-dot ${health.status}`} />
          <span className="card-title">{health.status}</span>
        </div>
        <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={refresh}>Refresh</button>
      </div>
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-value">{health.queue.waiting}</div>
          <div className="stat-label">Queued</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{health.queue.active}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{health.queue.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: health.queue.failed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{health.queue.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <span className={`badge ${health.browser.connected ? 'green' : 'red'}`}>
          Browser: {health.browser.connected ? 'connected' : 'disconnected'}
        </span>
        <span className={`badge ${health.worker.running ? 'blue' : 'muted'}`}>
          Worker: {health.worker.running ? 'running' : 'idle'}
        </span>
      </div>
    </div>
  );
}

function PromptSection({ port }: { port: number }) {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { events, connected, connect, disconnect } = useSSE(port, activeJobId);
  const streamRef = useRef<HTMLDivElement>(null);

  // Auto-scroll stream viewer
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [events]);

  // Poll for result when job completes via SSE
  useEffect(() => {
    const completeEvent = events.find(e => e.type === 'complete');
    const errorEvent = events.find(e => e.type === 'error');

    if ((completeEvent || errorEvent) && activeJobId) {
      fetchJob(port, activeJobId)
        .then(setResult)
        .catch(() => {});
    }
  }, [events, activeJobId, port]);

  async function handleSubmit() {
    if (!prompt.trim() || sending) return;

    setSending(true);
    setResult(null);
    setError(null);
    setActiveJobId(null);

    try {
      const { job_id } = await submitJob(port, prompt.trim());
      setActiveJobId(job_id);

      // Start SSE stream after a brief delay
      setTimeout(() => {
        connect();
      }, 200);

      // Poll for final result
      const pollResult = async () => {
        for (let i = 0; i < 300; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const job = await fetchJob(port, job_id);
            if (job.status === 'done' || job.status === 'failed') {
              setResult(job);
              return;
            }
          } catch { /* continue polling */ }
        }
      };
      pollResult();
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>Test Prompt</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          placeholder="Enter a prompt to test..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(); }}
          style={{ flex: 1, minHeight: 60 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={sending || !prompt.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </button>
          {connected && (
            <button className="btn" onClick={disconnect} style={{ fontSize: 11, padding: '4px 8px' }}>
              Stop SSE
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {activeJobId && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          Job: <span className="accent">{activeJobId}</span>
          {connected && <span className="badge green" style={{ marginLeft: 8 }}>SSE Live</span>}
        </div>
      )}

      {events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="text-sm muted" style={{ marginBottom: 4 }}>Stream Events</div>
          <div className="stream-viewer" ref={streamRef}>
            {events.map((evt, i) => (
              <div key={i} className="stream-event">
                <span className="stream-event-type">{evt.type}</span>
                <span className="stream-event-time">
                  {new Date(evt.receivedAt).toLocaleTimeString()}
                </span>
                <div className="stream-event-data">
                  {evt.type === 'partial_response'
                    ? truncate(String(evt.data.text ?? ''), 200)
                    : JSON.stringify(evt.data, null, 0).slice(0, 200)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12 }}>
          <div className="text-sm muted" style={{ marginBottom: 4 }}>
            Result
            <span className={`badge ${result.status === 'done' ? 'green' : 'red'}`} style={{ marginLeft: 8 }}>
              {result.status}
            </span>
            {result.timing?.total_ms && (
              <span className="text-sm muted" style={{ marginLeft: 8 }}>
                {(result.timing.total_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <div className="stream-viewer" style={{ maxHeight: 300 }}>
            {result.response ?? result.error?.message ?? 'No response'}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentJobsSection({ port }: { port: number }) {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);

  // Track job IDs from submitted prompts
  useEffect(() => {
    // We can't list all jobs (no list endpoint), so we track from test prompts
    // This is a placeholder — in production you'd have a list endpoint
  }, [port]);

  if (jobs.length === 0 && jobIds.length === 0) {
    return (
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Recent Jobs</div>
        <div className="muted text-sm">
          Jobs submitted via the test prompt above will appear here.
          A job list API endpoint will be available in a future release.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>Recent Jobs</div>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Job ID</th>
            <th>Prompt</th>
            <th>Duration</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.job_id}>
              <td>
                <span className={`badge ${job.status === 'done' ? 'green' : job.status === 'failed' ? 'red' : 'yellow'}`}>
                  {job.status}
                </span>
              </td>
              <td className="accent text-sm">{job.job_id.slice(0, 8)}...</td>
              <td>{truncate(job.prompt, 60)}</td>
              <td className="muted">
                {job.timing?.total_ms ? `${(job.timing.total_ms / 1000).toFixed(1)}s` : '-'}
              </td>
              <td className="muted text-sm">
                {new Date(job.created_at).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '...' : s;
}
