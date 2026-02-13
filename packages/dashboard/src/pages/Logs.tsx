import { useState, useEffect } from 'react';
import { loadApps, fetchJob, fetchJobStatus, type PingAppConfig, type JobResponse, type JobStatusResponse } from '../lib/api';

export function LogsPage() {
  const [apps] = useState<PingAppConfig[]>(loadApps);
  const [selectedApp, setSelectedApp] = useState<PingAppConfig | null>(apps[0] ?? null);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<JobResponse | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup() {
    if (!selectedApp || !jobId.trim()) return;
    setLoading(true);
    setError(null);
    setJob(null);
    setStatus(null);

    try {
      const [jobData, statusData] = await Promise.allSettled([
        fetchJob(selectedApp.port, jobId.trim()),
        fetchJobStatus(selectedApp.port, jobId.trim()),
      ]);

      if (jobData.status === 'fulfilled') setJob(jobData.value);
      else setError(String(jobData.reason));

      if (statusData.status === 'fulfilled') setStatus(statusData.value);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gap-16">
      <div className="page-header">
        <h1>Logs</h1>
        <p>Artifact timeline viewer and state transition inspector</p>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Job Lookup</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}>
            <label className="text-sm muted" style={{ display: 'block', marginBottom: 4 }}>PingApp</label>
            <select
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
              value={selectedApp?.port ?? ''}
              onChange={e => {
                const p = parseInt(e.target.value, 10);
                setSelectedApp(apps.find(a => a.port === p) ?? null);
              }}
            >
              {apps.map(a => (
                <option key={a.port} value={a.port}>{a.name} :{a.port}</option>
              ))}
              {apps.length === 0 && <option value="">No apps registered</option>}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="text-sm muted" style={{ display: 'block', marginBottom: 4 }}>Job ID</label>
            <input
              type="text"
              placeholder="Enter job UUID..."
              value={jobId}
              onChange={e => setJobId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleLookup} disabled={loading || !jobId.trim() || !selectedApp}>
            {loading ? 'Loading...' : 'Lookup'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>{error}</div>
        )}
      </div>

      {job && (
        <>
          <JobSummary job={job} />
          {(job.state_history || status?.state_history) && (
            <TimelineViewer transitions={job.state_history ?? status?.state_history ?? []} />
          )}
          {job.timing && <TimingViewer timing={job.timing} />}
          {job.response && <ResponseViewer response={job.response} thinking={job.thinking} />}
        </>
      )}

      {!job && !error && (
        <div className="empty-state">
          <h3>Enter a Job ID to inspect</h3>
          <p className="text-sm">View state transitions, timing, artifacts, and response details</p>
        </div>
      )}
    </div>
  );
}

function JobSummary({ job }: { job: JobResponse }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Job Summary</span>
        <span className={`badge ${job.status === 'done' ? 'green' : job.status === 'failed' ? 'red' : 'yellow'}`}>
          {job.status}
        </span>
      </div>
      <table>
        <tbody>
          <tr>
            <td className="muted" style={{ width: 140 }}>Job ID</td>
            <td className="accent">{job.job_id}</td>
          </tr>
          <tr>
            <td className="muted">Prompt</td>
            <td>{job.prompt}</td>
          </tr>
          <tr>
            <td className="muted">Created</td>
            <td>{new Date(job.created_at).toLocaleString()}</td>
          </tr>
          {job.timing?.total_ms != null && (
            <tr>
              <td className="muted">Duration</td>
              <td>{(job.timing.total_ms / 1000).toFixed(2)}s</td>
            </tr>
          )}
          {job.tool_used && (
            <tr>
              <td className="muted">Tool</td>
              <td><span className="badge blue">{job.tool_used}</span></td>
            </tr>
          )}
          {job.mode && (
            <tr>
              <td className="muted">Mode</td>
              <td><span className="badge blue">{job.mode}</span></td>
            </tr>
          )}
          {job.conversation_id && (
            <tr>
              <td className="muted">Conversation</td>
              <td className="text-sm">{job.conversation_id}</td>
            </tr>
          )}
          {job.artifact_path && (
            <tr>
              <td className="muted">Artifacts</td>
              <td className="text-sm">{job.artifact_path}</td>
            </tr>
          )}
          {job.error && (
            <tr>
              <td className="muted">Error</td>
              <td>
                <span className="badge red">{job.error.code}</span>
                <span style={{ marginLeft: 8 }}>{job.error.message}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TimelineViewer({ transitions }: { transitions: Array<{ timestamp: string; from: string; to: string; trigger: string; details?: string }> }) {
  if (transitions.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>State Timeline</div>
      <div className="timeline">
        {transitions.map((t, i) => (
          <div key={i} className="timeline-item">
            <div className="timeline-time">
              {new Date(t.timestamp).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 })}
            </div>
            <div className="timeline-label">
              <span className="badge muted" style={{ marginRight: 4 }}>{t.from}</span>
              <span className="muted" style={{ margin: '0 4px' }}>&rarr;</span>
              <span className={`badge ${t.to === 'DONE' ? 'green' : t.to === 'FAILED' ? 'red' : t.to === 'GENERATING' ? 'blue' : 'yellow'}`}>
                {t.to}
              </span>
              <span className="muted text-sm" style={{ marginLeft: 8 }}>({t.trigger})</span>
            </div>
            {t.details && <div className="timeline-detail">{t.details}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimingViewer({ timing }: { timing: NonNullable<JobResponse['timing']> }) {
  const entries = [
    { label: 'Queued', time: timing.queued_at },
    { label: 'Started', time: timing.started_at },
    { label: 'First Token', time: timing.first_token_at },
    { label: 'Completed', time: timing.completed_at },
  ].filter(e => e.time);

  if (entries.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>Timing</div>
      <div style={{ display: 'flex', gap: 24 }}>
        {entries.map((e, i) => (
          <div key={i}>
            <div className="text-sm muted">{e.label}</div>
            <div style={{ fontSize: 12 }}>
              {new Date(e.time!).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 })}
            </div>
          </div>
        ))}
        {timing.total_ms != null && (
          <div>
            <div className="text-sm muted">Total</div>
            <div className="accent" style={{ fontSize: 14, fontWeight: 600 }}>
              {(timing.total_ms / 1000).toFixed(2)}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseViewer({ response, thinking }: { response: string; thinking?: string }) {
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Response</span>
        <span className="text-sm muted">{response.length} chars</span>
      </div>
      {thinking && (
        <div style={{ marginBottom: 8 }}>
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11 }}
            onClick={() => setShowThinking(!showThinking)}
          >
            {showThinking ? 'Hide' : 'Show'} Thinking ({thinking.length} chars)
          </button>
          {showThinking && (
            <div className="stream-viewer" style={{ marginTop: 8, maxHeight: 200, color: 'var(--yellow)' }}>
              {thinking}
            </div>
          )}
        </div>
      )}
      <div className="stream-viewer" style={{ maxHeight: 400 }}>
        {response}
      </div>
    </div>
  );
}
