import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMultiHealth } from '../hooks/useHealth';
import { useApps } from '../hooks/useApps';
import { AppCard } from '../components/AppCard';
import { ActivityFeed, useActivity } from '../components/Activity';

export function HomePage() {
  const { apps, addApp, removeApp } = useApps();
  const { push } = useActivity();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('Gemini');
  const [newUrl, setNewUrl] = useState('http://localhost:3456');
  const [newPort, setNewPort] = useState('3456');
  const navigate = useNavigate();

  const ports = useMemo(() => apps.map(a => a.port), [apps]);
  const healthMap = useMultiHealth(ports, 2500);

  function handleAdd() {
    if (!newName.trim() || !newPort.trim()) return;
    const port = parseInt(newPort, 10);
    if (isNaN(port)) return;

    addApp({
      name: newName.trim(),
      url: newUrl.trim() || `http://localhost:${port}`,
      port,
    });
    push({ level: 'good', kind: 'registry', message: `Registered ${newName.trim()} :${port}` });
    setNewName('');
    setNewUrl('');
    setNewPort('3456');
    setShowAdd(false);
  }

  function handleRemove(port: number) {
    const app = apps.find(a => a.port === port);
    removeApp(port);
    push({ level: 'warn', kind: 'registry', message: `Removed ${app?.name ?? 'app'} :${port}` });
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-main">
          <div className="h1">PingApps</div>
          <div className="hsub">Observe and control every local shim, live.</div>
        </div>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => setShowAdd(true)}>Register App</button>
        </div>
      </div>

      <div className="grid">
        <div className="col">
          {apps.length === 0 ? (
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">No Apps</div>
                <div className="panel-sub">Register one to begin.</div>
              </div>
              <div className="empty">
                <div className="empty-title">Nothing connected</div>
                <div className="empty-sub">Add Gemini (3456), AI Studio (3457), or ChatGPT (3458).</div>
                <button className="btn primary" onClick={() => setShowAdd(true)}>Register App</button>
              </div>
            </div>
          ) : (
            <div className="cards">
              {apps.map(app => (
                <div key={app.port} onDoubleClick={() => navigate(`/app/${app.port}`)}>
                  <AppCard app={app} health={healthMap.get(app.port)} />
                  <div className="card-row-actions">
                    <button className="btn subtle" onClick={() => navigate(`/app/${app.port}`)}>Details</button>
                    <button className="btn subtle danger" onClick={() => handleRemove(app.port)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col sidecol">
          <ActivityFeed compact />
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Quick Add</div>
              <div className="panel-sub">Defaults: 3456/3457/3458</div>
            </div>
            <div className="quick-add">
              <button className="btn subtle" onClick={() => { setNewName('Gemini'); setNewUrl('http://localhost:3456'); setNewPort('3456'); setShowAdd(true); }}>Gemini</button>
              <button className="btn subtle" onClick={() => { setNewName('AI Studio'); setNewUrl('http://localhost:3457'); setNewPort('3457'); setShowAdd(true); }}>AI Studio</button>
              <button className="btn subtle" onClick={() => { setNewName('ChatGPT'); setNewUrl('http://localhost:3458'); setNewPort('3458'); setShowAdd(true); }}>ChatGPT</button>
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <div className="panel-title">Register PingApp</div>
                <div className="panel-sub">Local URL + port (proxied via Vite)</div>
              </div>
              <button className="btn subtle" onClick={() => setShowAdd(false)}>Close</button>
            </div>
            <div className="form">
              <label>
                <div className="label">Name</div>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Gemini" />
              </label>
              <label>
                <div className="label">URL</div>
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="http://localhost:3456" />
              </label>
              <label>
                <div className="label">Port</div>
                <input value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="3456" />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn primary" onClick={handleAdd}>Register</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
