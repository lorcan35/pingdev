type HealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'offline'
  | 'loading'
  | (string & {});

function statusStyles(status: HealthStatus): { dot: string; ring: string; label: string } {
  switch (status) {
    case 'healthy':
      return { dot: 'bg-health-healthy shadow-glow-green', ring: 'bg-health-healthy', label: 'Healthy' };
    case 'degraded':
      return { dot: 'bg-health-degraded shadow-glow-amber', ring: 'bg-health-degraded', label: 'Degraded' };
    case 'unhealthy':
      return { dot: 'bg-health-offline shadow-glow-red', ring: 'bg-health-offline', label: 'Unhealthy' };
    case 'offline':
      return { dot: 'bg-health-offline shadow-glow-red', ring: 'bg-health-offline', label: 'Offline' };
    case 'loading':
      return { dot: 'bg-border', ring: 'bg-border', label: 'Loading' };
    default:
      return { dot: 'bg-border', ring: 'bg-border', label: String(status) };
  }
}

export function HealthPulse({
  status,
  size = 12,
}: {
  status: HealthStatus;
  /** dot size in px */
  size?: number;
}) {
  const st = statusStyles(status);

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      title={st.label}
      aria-label={`health ${String(status)}`}
    >
      <span
        className={`absolute inset-0 rounded-full opacity-30 blur-[1px] ${st.ring} ${status === 'loading' ? '' : 'animate-pulseGlow'}`}
      />
      <span className={`relative block h-full w-full rounded-full ${st.dot}`} />
    </span>
  );
}

export function QueueFlow({
  waiting,
  active,
  completed,
  failed,
}: {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}) {
  const w = Math.max(0, waiting);
  const a = Math.max(0, active);
  const c = Math.max(0, completed);
  const f = Math.max(0, failed);
  const total = Math.max(1, w + a + c + f);

  const seg = (n: number) => `${Math.max(2, Math.round((n / total) * 100))}%`;

  return (
    <div className="w-full">
      <div className="flex h-2 w-full overflow-hidden rounded bg-border">
        <div style={{ width: seg(w) }} className="h-full bg-border/70" title={`waiting ${w}`} />
        <div style={{ width: seg(a) }} className="h-full bg-accent-cyan" title={`active ${a}`} />
        <div style={{ width: seg(c) }} className="h-full bg-health-healthy" title={`done ${c}`} />
        <div style={{ width: seg(f) }} className="h-full bg-health-offline" title={`failed ${f}`} />
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-border/70" /> waiting {w}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent-cyan" /> active {a}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-health-healthy" /> done {c}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-health-offline" /> failed {f}
        </span>
      </div>
    </div>
  );
}

export function StateStrip({
  waiting,
  active,
}: {
  waiting: number;
  active: number;
}) {
  const w = Math.max(0, waiting);
  const a = Math.max(0, active);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded border border-border bg-surface px-2 py-1 text-muted">
        waiting <span className="text-fg">{w}</span>
      </span>
      <span className="rounded border border-border bg-surface px-2 py-1 text-muted">
        active <span className="text-fg">{a}</span>
      </span>
    </div>
  );
}
