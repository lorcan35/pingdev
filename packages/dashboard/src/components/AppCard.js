import { Link } from 'react-router-dom';
import { HealthPulse, QueueFlow, StateStrip } from './AppViz';
function statusOf(st) {
    if (!st)
        return 'loading';
    if (st.error)
        return 'offline';
    return st.health?.status ?? 'loading';
}
export function AppCard({ app, health, }) {
    const status = statusOf(health);
    const q = health?.health?.queue;
    const waiting = q?.waiting ?? 0;
    const active = q?.active ?? 0;
    const completed = q?.completed ?? 0;
    const failed = q?.failed ?? 0;
    return (<div className={`appcard st-${status}`}>
      <div className="appcard-top">
        <div className="appcard-id">
          <HealthPulse status={status}/>
          <div className="appcard-name">
            <div className="appcard-title">{app.name}</div>
            <div className="appcard-sub">
              <span className="mono dim">{app.url}</span>
              <span className="sep">•</span>
              <span className="mono acc">:{app.port}</span>
            </div>
          </div>
        </div>

        <div className="appcard-actions">
          <Link to={`/app/${app.port}`} className="btn primary">Open</Link>
        </div>
      </div>

      <div className="appcard-mid">
        <StateStrip waiting={waiting} active={active}/>
        <div className="appcard-statusline">
          {status === 'loading' && <span className="badge muted">checking</span>}
          {status === 'offline' && <span className="badge bad">offline</span>}
          {status === 'healthy' && <span className="badge good">healthy</span>}
          {status === 'degraded' && <span className="badge warn">degraded</span>}
          {status === 'unhealthy' && <span className="badge bad">unhealthy</span>}
          {health?.health?.worker?.current_job && (<span className="badge info">job {String(health.health.worker.current_job).slice(0, 8)}…</span>)}
        </div>
      </div>

      <div className="appcard-queue">
        <QueueFlow waiting={waiting} active={active} completed={completed} failed={failed}/>
      </div>
    </div>);
}
//# sourceMappingURL=AppCard.js.map