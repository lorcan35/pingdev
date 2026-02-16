import { useMemo, useState } from 'react';
import { fetchJob, fetchJobStatus } from '../lib/api';
import { useApps } from '../hooks/useApps';
import { useToast } from '../components/Toasts';
export function LogsPage() {
    const { apps } = useApps();
    const { toast } = useToast();
    const [selectedPort, setSelectedPort] = useState(apps[0]?.port ?? 3456);
    const selectedApp = useMemo(() => apps.find(a => a.port === selectedPort) ?? null, [apps, selectedPort]);
    const [jobId, setJobId] = useState('');
    const [job, setJob] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    async function lookup() {
        if (!selectedApp || !jobId.trim())
            return;
        setLoading(true);
        setError(null);
        setJob(null);
        setStatus(null);
        try {
            const [jobData, statusData] = await Promise.allSettled([
                fetchJob(selectedApp.port, jobId.trim()),
                fetchJobStatus(selectedApp.port, jobId.trim()),
            ]);
            if (jobData.status === 'fulfilled')
                setJob(jobData.value);
            else
                setError(String(jobData.reason));
            if (statusData.status === 'fulfilled')
                setStatus(statusData.value);
            toast({ intent: 'info', title: 'Lookup complete', message: `${selectedApp.name} ${jobId.trim().slice(0, 8)}…` });
        }
        catch (e) {
            setError(String(e));
            toast({ intent: 'bad', title: 'Lookup failed', message: String(e) });
        }
        finally {
            setLoading(false);
        }
    }
    return (<div className="page">
      <div className="hero">
        <div className="hero-main">
          <div className="h1">Logs</div>
          <div className="hsub">Inspect state transitions, timing, and artifacts for a job.</div>
        </div>
      </div>

      <div className="logs-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Job Lookup</div>
            <div className="panel-sub">Enter a job id and fetch its timeline.</div>
          </div>

          <div className="form">
            <label>
              <div className="label">PingApp</div>
              <select value={selectedPort} onChange={e => setSelectedPort(parseInt(e.target.value, 10))}>
                {apps.map(a => (<option key={a.port} value={a.port}>{a.name} :{a.port}</option>))}
              </select>
            </label>
            <label>
              <div className="label">Job ID</div>
              <input value={jobId} onChange={e => setJobId(e.target.value)} placeholder="UUID" onKeyDown={e => { if (e.key === 'Enter')
        lookup(); }}/>
            </label>
          </div>

          <div className="row">
            <button className="btn primary" disabled={loading || !jobId.trim() || !selectedApp} onClick={lookup}>
              {loading ? 'Loading…' : 'Lookup'}
            </button>
            {selectedApp && (<button className="btn subtle" onClick={async () => {
                await navigator.clipboard.writeText(jobId.trim());
                toast({ intent: 'good', title: 'Copied', message: 'Job ID copied to clipboard' });
            }} disabled={!jobId.trim()}>
                Copy Job ID
              </button>)}
          </div>

          {error && <div className="callout bad">{error}</div>}
          {!error && !job && <div className="empty mini"><div className="empty-title">Awaiting job id</div><div className="empty-sub">Paste one from App console "Recent" list.</div></div>}
        </div>

        <div className="stack">
          {job && <JobSummary job={job}/>}
          {(job?.state_history || status?.state_history) && (<Timeline transitions={job?.state_history ?? status?.state_history ?? []}/>)}
          {(job?.timing || status?.timing) && <Timing timing={(job?.timing ?? status?.timing)}/>}
          {job?.response && <Response response={job.response} thinking={job.thinking}/>}
        </div>
      </div>
    </div>);
}
function JobSummary({ job }) {
    return (<div className="panel">
      <div className="panel-head">
        <div className="panel-title">Summary</div>
        <div className="panel-sub">Result envelope</div>
      </div>
      <div className="kv">
        <div className="kv-row"><div className="k">Job</div><div className="v mono acc">{job.job_id}</div></div>
        <div className="kv-row"><div className="k">Status</div><div className="v"><span className={`badge ${job.status === 'done' ? 'good' : job.status === 'failed' ? 'bad' : 'warn'}`}>{job.status}</span></div></div>
        <div className="kv-row"><div className="k">Created</div><div className="v">{new Date(job.created_at).toLocaleString()}</div></div>
        <div className="kv-row"><div className="k">Prompt</div><div className="v">{job.prompt}</div></div>
        {job.tool_used && <div className="kv-row"><div className="k">Tool</div><div className="v"><span className="badge info">{job.tool_used}</span></div></div>}
        {job.mode && <div className="kv-row"><div className="k">Mode</div><div className="v"><span className="badge info">{job.mode}</span></div></div>}
        {job.artifact_path && <div className="kv-row"><div className="k">Artifacts</div><div className="v mono dim">{job.artifact_path}</div></div>}
        {job.error && <div className="kv-row"><div className="k">Error</div><div className="v"><span className="badge bad">{job.error.code}</span> <span className="dim">{job.error.message}</span></div></div>}
      </div>
    </div>);
}
function Timeline({ transitions }) {
    if (transitions.length === 0)
        return null;
    return (<div className="panel">
      <div className="panel-head">
        <div className="panel-title">Timeline</div>
        <div className="panel-sub">State transitions</div>
      </div>
      <div className="timeline2">
        {transitions.map((t, i) => (<div key={i} className="tl-item">
            <div className="tl-ts">{new Date(t.timestamp).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 })}</div>
            <div className="tl-main">
              <span className="badge muted">{t.from}</span>
              <span className="dim">→</span>
              <span className={`badge ${t.to === 'DONE' ? 'good' : t.to === 'FAILED' ? 'bad' : t.to === 'GENERATING' ? 'info' : 'warn'}`}>{t.to}</span>
              <span className="dim">({t.trigger})</span>
            </div>
            {t.details && <div className="tl-det dim">{t.details}</div>}
          </div>))}
      </div>
    </div>);
}
function Timing({ timing }) {
    const entries = [
        { label: 'Queued', time: timing.queued_at },
        { label: 'Started', time: timing.started_at },
        { label: 'First token', time: timing.first_token_at },
        { label: 'Completed', time: timing.completed_at },
    ].filter(e => e.time);
    if (entries.length === 0)
        return null;
    return (<div className="panel">
      <div className="panel-head">
        <div className="panel-title">Timing</div>
        <div className="panel-sub">Latencies</div>
      </div>
      <div className="timing">
        {entries.map((e, i) => (<div key={i} className="tcell">
            <div className="dim">{e.label}</div>
            <div className="mono">{new Date(e.time).toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 })}</div>
          </div>))}
        {timing.total_ms != null && (<div className="tcell">
            <div className="dim">Total</div>
            <div className="mono acc">{(timing.total_ms / 1000).toFixed(2)}s</div>
          </div>)}
      </div>
    </div>);
}
function Response({ response, thinking }) {
    const [showThinking, setShowThinking] = useState(false);
    return (<div className="panel">
      <div className="panel-head">
        <div className="panel-title">Response</div>
        <div className="panel-sub">{response.length} chars</div>
      </div>
      {thinking && (<div className="row" style={{ marginBottom: 8 }}>
          <button className="btn subtle" onClick={() => setShowThinking(v => !v)}>
            {showThinking ? 'Hide' : 'Show'} thinking
          </button>
        </div>)}
      {showThinking && thinking && <div className="codebox warn"><pre>{thinking}</pre></div>}
      <div className="codebox"><pre>{response}</pre></div>
    </div>);
}
//# sourceMappingURL=Logs.js.map