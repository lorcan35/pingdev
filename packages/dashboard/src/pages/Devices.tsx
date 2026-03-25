import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor,
  Camera,
  MousePointerClick,
  Type,
  ArrowDownUp,
  Globe,
  Terminal,
  Search,
  Radar,
  X,
  ChevronRight,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function favicon(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Device Card
// ---------------------------------------------------------------------------

function DeviceCard({
  device,
  selected,
  onSelect,
}: {
  device: gw.Device;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      layout
      onClick={onSelect}
      className={`
        w-full text-left rounded-xl border p-4 transition-all cursor-pointer
        ${selected
          ? 'border-accent-cyan/40 bg-surface shadow-glow-cyan'
          : 'border-border bg-surface hover:border-border/80 hover:bg-surface/80'}
      `}
    >
      <div className="flex items-center gap-3">
        {device.url && (
          <img
            src={favicon(device.url)}
            alt=""
            className="w-5 h-5 rounded-sm flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-fg font-medium truncate text-sm">
            {device.title || 'Untitled'}
          </div>
          <div className="text-muted text-xs truncate mt-0.5">{device.url}</div>
        </div>
        <span className="w-2.5 h-2.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(0,255,136,0.5)] flex-shrink-0" />
        <ChevronRight className="w-4 h-4 text-dim flex-shrink-0" />
      </div>
      <div className="text-dim text-[11px] mt-2 font-mono truncate">
        {device.deviceId}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Quick Op Button
// ---------------------------------------------------------------------------

function OpButton({
  icon: Icon,
  label,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium text-fg hover:border-accent-cyan/40 hover:shadow-glow-cyan transition-all disabled:opacity-40 cursor-pointer"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function DetailPanel({
  device,
  onClose,
}: {
  device: gw.Device;
  onClose: () => void;
}) {
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  // Quick ops state
  const [clickSel, setClickSel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [typeText, setTypeText] = useState('');
  const [scrollDir, setScrollDir] = useState('down');
  const [scrollAmt, setScrollAmt] = useState('300');
  const [navUrl, setNavUrl] = useState('');

  // Eval console
  const [evalExpr, setEvalExpr] = useState('');
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Intelligence
  const [discoverResult, setDiscoverResult] = useState<any>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  // Recon
  const [reconResult, setReconResult] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);

  // Op feedback
  const [opMsg, setOpMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setOpMsg(msg);
    setTimeout(() => setOpMsg(null), 2000);
  };

  const handleScreenshot = async () => {
    setScreenshotLoading(true);
    try {
      const res = await gw.screenshot(device.deviceId);
      const data = res.screenshot || res.image || res.data || res.result;
      if (typeof data === 'string') {
        const src = data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
        setScreenshotSrc(src);
      } else {
        flash('No image data returned');
      }
    } catch (e: any) {
      flash(`Error: ${e.message}`);
    } finally {
      setScreenshotLoading(false);
    }
  };

  const handleClick = async () => {
    if (!clickSel.trim()) return;
    try {
      await gw.click(device.deviceId, clickSel.trim());
      flash(`Clicked: ${clickSel}`);
    } catch (e: any) { flash(`Error: ${e.message}`); }
  };

  const handleType = async () => {
    if (!typeText.trim()) return;
    try {
      await gw.type_(device.deviceId, typeText, typeSel || undefined);
      flash(`Typed: "${typeText}"`);
    } catch (e: any) { flash(`Error: ${e.message}`); }
  };

  const handleScroll = async () => {
    try {
      await gw.scroll(device.deviceId, scrollDir, parseInt(scrollAmt) || 300);
      flash(`Scrolled ${scrollDir} ${scrollAmt}px`);
    } catch (e: any) { flash(`Error: ${e.message}`); }
  };

  const handleNavigate = async () => {
    if (!navUrl.trim()) return;
    try {
      await gw.navigate(device.deviceId, navUrl.trim());
      flash(`Navigated to ${navUrl}`);
    } catch (e: any) { flash(`Error: ${e.message}`); }
  };

  const handleEval = async () => {
    if (!evalExpr.trim()) return;
    setEvalLoading(true);
    try {
      const res = await gw.evalJs(device.deviceId, evalExpr);
      setEvalResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setEvalResult(`Error: ${e.message}`);
    } finally {
      setEvalLoading(false);
    }
  };

  const handleDiscover = async () => {
    setDiscoverLoading(true);
    try {
      const res = await gw.discover(device.deviceId);
      setDiscoverResult(res);
    } catch (e: any) {
      setDiscoverResult({ error: e.message });
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleRecon = async () => {
    setReconLoading(true);
    try {
      const res = await gw.recon(device.deviceId);
      setReconResult(res);
    } catch (e: any) {
      setReconResult({ error: e.message });
    } finally {
      setReconLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="flex flex-col h-full overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface z-10">
        <div className="min-w-0 flex-1">
          <div className="text-fg font-semibold truncate">{device.title || 'Untitled'}</div>
          <div className="text-dim text-xs font-mono truncate">{device.deviceId}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-border/50 text-dim hover:text-fg transition cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Op feedback toast */}
      <AnimatePresence>
        {opMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-3 rounded-lg bg-accent-green/10 border border-accent-green/20 px-3 py-2 text-xs text-accent-green"
          >
            {opMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 space-y-5 flex-1">
        {/* Screenshot */}
        <section>
          <OpButton icon={Camera} label="Take Screenshot" loading={screenshotLoading} onClick={handleScreenshot} />
          {screenshotSrc && (
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              src={screenshotSrc}
              alt="Screenshot"
              className="mt-3 rounded-lg border border-border w-full"
            />
          )}
        </section>

        {/* Quick Ops */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Quick Ops</h3>

          {/* Click */}
          <div className="flex gap-2">
            <input className={inputCls} placeholder="CSS selector to click" value={clickSel} onChange={e => setClickSel(e.target.value)} />
            <OpButton icon={MousePointerClick} label="Click" onClick={handleClick} />
          </div>

          {/* Type */}
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1`} placeholder="Selector (optional)" value={typeSel} onChange={e => setTypeSel(e.target.value)} />
            <input className={`${inputCls} flex-1`} placeholder="Text to type" value={typeText} onChange={e => setTypeText(e.target.value)} />
            <OpButton icon={Type} label="Type" onClick={handleType} />
          </div>

          {/* Scroll */}
          <div className="flex gap-2">
            <select className={inputCls + ' w-28'} value={scrollDir} onChange={e => setScrollDir(e.target.value)}>
              <option value="down">Down</option>
              <option value="up">Up</option>
            </select>
            <input className={`${inputCls} w-24`} type="number" placeholder="px" value={scrollAmt} onChange={e => setScrollAmt(e.target.value)} />
            <OpButton icon={ArrowDownUp} label="Scroll" onClick={handleScroll} />
          </div>

          {/* Navigate */}
          <div className="flex gap-2">
            <input className={inputCls} placeholder="https://..." value={navUrl} onChange={e => setNavUrl(e.target.value)} />
            <OpButton icon={Globe} label="Go" onClick={handleNavigate} />
          </div>
        </section>

        {/* Eval Console */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Eval Console</h3>
          <textarea
            className={inputCls + ' min-h-[80px] font-mono text-xs'}
            placeholder="document.title"
            value={evalExpr}
            onChange={e => setEvalExpr(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEval(); }}
          />
          <OpButton icon={Terminal} label="Run (Ctrl+Enter)" loading={evalLoading} onClick={handleEval} />
          {evalResult && (
            <pre className="rounded-lg bg-bg border border-border p-3 text-xs text-accent-green font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
              {evalResult}
            </pre>
          )}
        </section>

        {/* Page Intelligence */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Page Intelligence</h3>
          <div className="flex gap-2">
            <OpButton icon={Search} label="Discover" loading={discoverLoading} onClick={handleDiscover} />
            <OpButton icon={Radar} label="Recon" loading={reconLoading} onClick={handleRecon} />
          </div>

          {discoverResult && (
            <div className="rounded-lg bg-bg border border-border p-3 space-y-2">
              <div className="text-xs font-semibold text-accent-cyan">Discover Result</div>
              <pre className="text-xs text-fg font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(discoverResult, null, 2)}
              </pre>
            </div>
          )}

          {reconResult && (
            <div className="rounded-lg bg-bg border border-border p-3 space-y-2">
              <div className="text-xs font-semibold text-accent-cyan">Recon Result</div>
              <pre className="text-xs text-fg font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(reconResult, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Devices Page
// ---------------------------------------------------------------------------

export function DevicesPage() {
  const [devices, setDevices] = useState<gw.Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await gw.devices();
      const list = res?.extension?.devices ?? [];
      setDevices(list);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    intervalRef.current = setInterval(fetchDevices, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchDevices]);

  const selected = devices.find(d => d.deviceId === selectedId) ?? null;

  return (
    <div className="page">
      {/* Hero */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">Device Explorer</h1>
            <p className="text-muted text-sm mt-1">
              {devices.length} device{devices.length !== 1 ? 's' : ''} connected
            </p>
          </div>
          <button
            onClick={fetchDevices}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-fg hover:border-accent-cyan/40 hover:shadow-glow-cyan transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-health-offline/30 bg-health-offline/5 px-4 py-3 text-sm text-health-offline">
          {error}
        </div>
      )}

      <div className="flex gap-6 min-h-0" style={{ height: 'calc(100vh - 220px)' }}>
        {/* Device list */}
        <div className="w-[380px] flex-shrink-0 space-y-2 overflow-y-auto pr-2">
          {loading && devices.length === 0 && (
            <div className="flex items-center justify-center py-20 text-dim">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading devices...
            </div>
          )}
          {!loading && devices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Monitor className="w-10 h-10 text-dim mb-3" />
              <div className="text-fg font-medium">No devices found</div>
              <div className="text-dim text-sm mt-1">Connect the PingOS extension to see devices here.</div>
            </div>
          )}
          <AnimatePresence>
            {devices.map(d => (
              <DeviceCard
                key={d.deviceId}
                device={d}
                selected={selectedId === d.deviceId}
                onSelect={() => setSelectedId(prev => prev === d.deviceId ? null : d.deviceId)}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 rounded-xl border border-border bg-surface overflow-hidden">
          <AnimatePresence mode="wait">
            {selected ? (
              <DetailPanel
                key={selected.deviceId}
                device={selected}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-center p-8"
              >
                <Monitor className="w-12 h-12 text-dim mb-4" />
                <div className="text-fg font-medium">Select a device</div>
                <div className="text-dim text-sm mt-1">
                  Click on a device card to view details, take screenshots, and run operations.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
