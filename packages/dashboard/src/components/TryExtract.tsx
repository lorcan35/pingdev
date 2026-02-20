import { useEffect, useState } from 'react';
import { Search, Loader2, ChevronDown } from 'lucide-react';
import { fetchDevices, extractFromDevice, type DeviceInfo } from '../lib/gateway';

export function TryExtract() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchDevices()
      .then((devs) => {
        if (!mounted) return;
        setDevices(devs);
        if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].id);
      })
      .catch(() => {
        if (mounted) setDevices([]);
      });
    return () => { mounted = false; };
  }, []);

  async function handleExtract() {
    if (!selectedDevice || !query.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await extractFromDevice(selectedDevice, query.trim());
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExtract();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-fg">Try Extract</h2>
        <p className="mt-0.5 text-xs text-muted">Pull structured data from any shared tab</p>
      </div>

      <div className="space-y-3 px-5 py-4">
        {/* Device selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Device</label>
          <div className="relative">
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full appearance-none rounded-md border border-border bg-bg px-3 py-2 pr-8 text-sm text-fg outline-none transition focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/30"
            >
              {devices.length === 0 && (
                <option value="">No devices connected</option>
              )}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.url || d.id}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </div>

        {/* Query input */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Extract all product titles and prices"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder-dim outline-none transition focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/30"
          />
        </div>

        {/* Extract button */}
        <button
          onClick={handleExtract}
          disabled={loading || !selectedDevice || !query.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-accent-green/15 px-4 py-2 text-sm font-medium text-accent-green transition hover:bg-accent-green/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          {loading ? 'Extracting...' : 'Extract'}
        </button>

        {/* Results */}
        {error && (
          <div className="rounded-md border border-health-offline/30 bg-health-offline/10 px-4 py-3 text-sm text-health-offline">
            {error}
          </div>
        )}

        {result && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Result</div>
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg p-4 font-mono text-xs leading-relaxed text-fg">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
