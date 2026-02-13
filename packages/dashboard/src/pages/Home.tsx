import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadApps, addApp, removeApp, type PingAppConfig } from '../lib/api';
import { useMultiHealth } from '../hooks/useHealth';

export function HomePage() {
  const [apps, setApps] = useState<PingAppConfig[]>(loadApps);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newPort, setNewPort] = useState('3456');
  const navigate = useNavigate();

  const ports = apps.map(a => a.port);
  const healthMap = useMultiHealth(ports);

  // Refresh app list from storage on mount
  useEffect(() => {
    setApps(loadApps());
  }, []);

  function handleAdd() {
    if (!newName.trim() || !newPort.trim()) return;
    const port = parseInt(newPort, 10);
    if (isNaN(port)) return;

    const updated = addApp({
      name: newName.trim(),
      url: newUrl.trim() || `http://localhost:${port}`,
      port,
    });
    setApps(updated);
    setNewName('');
    setNewUrl('');
    setNewPort('3456');
    setShowAdd(false);
  }

  function handleRemove(port: number) {
    setApps(removeApp(port));
  }

  return (
    <div className="gap-16">
      <div className="page-header">
        <div className="flex-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1>PingApps</h1>
            <p>Manage and monitor your local API shims</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            + Add App
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Register PingApp</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="text-sm muted" style={{ display: 'block', marginBottom: 4 }}>Name</label>
              <input
                type="text"
                placeholder="e.g. gemini"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div style={{ flex: 2 }}>
              <label className="text-sm muted" style={{ display: 'block', marginBottom: 4 }}>Site URL</label>
              <input
                type="url"
                placeholder="https://gemini.google.com"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
              />
            </div>
            <div style={{ width: 100 }}>
              <label className="text-sm muted" style={{ display: 'block', marginBottom: 4 }}>Port</label>
              <input
                type="number"
                placeholder="3456"
                value={newPort}
                onChange={e => setNewPort(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="empty-state">
          <h3>No PingApps registered</h3>
          <p>Click "Add App" to register a PingApp instance</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>URL</th>
                <th>Port</th>
                <th>Queue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => {
                const h = healthMap.get(app.port);
                const status = h?.health?.status ?? (h?.error ? 'offline' : 'loading');
                const queue = h?.health?.queue;

                return (
                  <tr
                    key={app.port}
                    className="clickable-row"
                    onClick={() => navigate(`/app/${app.port}`)}
                  >
                    <td>
                      <span className={`status-dot ${status === 'loading' ? 'offline' : status === 'offline' ? 'offline' : status}`} />
                      {status === 'loading' ? '...' : status}
                    </td>
                    <td style={{ fontWeight: 600 }}>{app.name}</td>
                    <td className="muted">{app.url}</td>
                    <td><span className="accent">:{app.port}</span></td>
                    <td>
                      {queue ? (
                        <span className="text-sm">
                          <span className="badge yellow" style={{ marginRight: 4 }}>{queue.waiting} queued</span>
                          <span className="badge blue" style={{ marginRight: 4 }}>{queue.active} active</span>
                          <span className="badge green">{queue.completed} done</span>
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={(e) => { e.stopPropagation(); handleRemove(app.port); }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
