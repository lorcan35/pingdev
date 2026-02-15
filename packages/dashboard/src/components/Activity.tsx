import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApps } from '../hooks/useApps';
import { useMultiHealth } from '../hooks/useHealth';

export type ActivityLevel = 'info' | 'good' | 'warn' | 'bad';

export interface ActivityItem {
  id: string;
  ts: number;
  level: ActivityLevel;
  appPort?: number;
  appName?: string;
  kind: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface ActivityCtx {
  items: ActivityItem[];
  push: (item: Omit<ActivityItem, 'id' | 'ts'> & { ts?: number }) => void;
}

const Ctx = createContext<ActivityCtx | null>(null);

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { apps } = useApps();
  const ports = useMemo(() => apps.map(a => a.port), [apps]);
  const healthMap = useMultiHealth(ports, 2500);
  const prevRef = useRef<Map<number, { status?: string; waiting?: number; active?: number; completed?: number; failed?: number }>>(new Map());

  const [items, setItems] = useState<ActivityItem[]>(() => []);

  const push: ActivityCtx['push'] = useCallback((item) => {
    const ts = item.ts ?? Date.now();
    const full: ActivityItem = { ...item, ts, id: uid() };
    setItems(prev => [full, ...prev].slice(0, 120));
  }, []);

  useEffect(() => {
    if (ports.length === 0) return;

    const nextPrev = new Map(prevRef.current);
    for (const app of apps) {
      const st = healthMap.get(app.port);
      const status = st?.health?.status ?? (st?.error ? 'offline' : 'loading');
      const q = st?.health?.queue;

      const prev = prevRef.current.get(app.port);
      if (!prev) {
        nextPrev.set(app.port, { status, waiting: q?.waiting, active: q?.active, completed: q?.completed, failed: q?.failed });
        if (status !== 'loading') {
          push({
            level: status === 'healthy' ? 'good' : status === 'degraded' ? 'warn' : status === 'unhealthy' ? 'bad' : 'bad',
            appPort: app.port,
            appName: app.name,
            kind: 'health',
            message: status === 'offline' ? 'Agent offline' : `Health: ${status}`,
          });
        }
        continue;
      }

      if (prev.status !== status && status !== 'loading') {
        push({
          level: status === 'healthy' ? 'good' : status === 'degraded' ? 'warn' : status === 'unhealthy' ? 'bad' : 'bad',
          appPort: app.port,
          appName: app.name,
          kind: 'health',
          message: status === 'offline' ? 'Agent offline' : `Health: ${status}`,
          meta: { from: prev.status, to: status },
        });
      }

      if (q && (prev.active !== q.active || prev.waiting !== q.waiting)) {
        if ((prev.active ?? 0) === 0 && q.active > 0) {
          push({
            level: 'info',
            appPort: app.port,
            appName: app.name,
            kind: 'queue',
            message: `Worker engaged (${q.active} active)`,
          });
        }
        if ((prev.waiting ?? 0) === 0 && q.waiting > 0) {
          push({
            level: 'info',
            appPort: app.port,
            appName: app.name,
            kind: 'queue',
            message: `Queue building (${q.waiting} waiting)`,
          });
        }
      }

      nextPrev.set(app.port, { status, waiting: q?.waiting, active: q?.active, completed: q?.completed, failed: q?.failed });
    }

    prevRef.current = nextPrev;
  }, [apps, ports.join(','), healthMap, push]);

  const value = useMemo<ActivityCtx>(() => ({ items, push }), [items]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivity() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useActivity must be used within ActivityProvider');
  return v;
}

export function ActivityFeed({ compact }: { compact?: boolean }) {
  const { items } = useActivity();

  return (
    <div className={`panel ${compact ? 'panel-compact' : ''}`}>
      <div className="panel-head">
        <div className="panel-title">Activity</div>
        <div className="panel-sub">Live pulses from health + queues</div>
      </div>

      {items.length === 0 ? (
        <div className="empty mini">
          <div className="empty-title">No signals yet</div>
          <div className="empty-sub">Start a job or wait for a health change.</div>
        </div>
      ) : (
        <div className="feed">
          {items.slice(0, compact ? 8 : 24).map(it => (
            <div key={it.id} className={`feed-item lvl-${it.level}`}>
              <div className="feed-top">
                <div className="feed-app">{it.appName ? `${it.appName} :${it.appPort}` : 'System'}</div>
                <div className="feed-ts">{new Date(it.ts).toLocaleTimeString(undefined, { hour12: false })}</div>
              </div>
              <div className="feed-msg">{it.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
