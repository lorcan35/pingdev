import { useEffect, useState } from 'react';
import { Activity, Monitor } from 'lucide-react';
import { fetchGatewayHealth, fetchDevices, type GatewayHealth, type DeviceInfo } from '../lib/gateway';

export function SystemHealth() {
  const [gwHealth, setGwHealth] = useState<GatewayHealth | null>(null);
  const [gwError, setGwError] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const health = await fetchGatewayHealth();
        if (mounted) { setGwHealth(health); setGwError(false); }
      } catch {
        if (mounted) { setGwHealth(null); setGwError(true); }
      }

      try {
        const devs = await fetchDevices();
        if (mounted) setDevices(devs);
      } catch {
        if (mounted) setDevices([]);
      }
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const online = gwHealth !== null && !gwError;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-muted" />
        <span className="text-muted">Gateway</span>
        <span className="relative flex h-2.5 w-2.5">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-health-healthy opacity-40" />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? 'bg-health-healthy shadow-glow-green' : 'bg-health-offline shadow-glow-red'}`} />
        </span>
        <span className={online ? 'text-health-healthy' : 'text-health-offline'}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        <Monitor size={14} className="text-muted" />
        <span className="text-muted">Shared Tabs</span>
        <span className="rounded bg-border px-1.5 py-0.5 font-mono text-xs text-fg">
          {devices.length}
        </span>
      </div>
    </div>
  );
}
