import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, ArrowRight, CheckCircle, Cookie, Database,
  Globe, HardDrive, MonitorSmartphone, Network, Play, RefreshCcw, Sparkles,
  Terminal, Trash2, Wifi, WifiOff,
} from 'lucide-react';
import * as gw from '../lib/gw';
import type { Device } from '../lib/gw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flatDevices(res: gw.DevicesResponse | null): Device[] {
  if (!res?.extension) return [];
  return res.extension.devices ?? [];
}

function ts() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeviceChip({
  device,
  selected,
  onClick,
}: {
  device: Device;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
        selected
          ? 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan shadow-glow-cyan'
          : 'border-border bg-surface text-muted hover:text-fg hover:border-border'
      }`}
    >
      <Globe size={12} />
      <span className="truncate max-w-[180px]">{device.title || device.url}</span>
      <span className="text-dim text-[10px]">#{device.tabId}</span>
    </button>
  );
}

interface NetworkEntry {
  id: number;
  ts: string;
  method?: string;
  url?: string;
  status?: number;
  type?: string;
  data?: any;
}

interface LogEntry {
  id: number;
  ts: string;
  level: 'info' | 'warn' | 'error' | 'ok';
  message: string;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DevTools() {
  // Devices
  const [devicesData, setDevicesData] = useState<gw.DevicesResponse | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const devices = flatDevices(devicesData);
  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId) ?? null;

  // Active tab
  const [tab, setTab] = useState<'network' | 'storage' | 'logs' | 'eval' | 'clean'>('network');

  // Network
  const [networkEntries, setNetworkEntries] = useState<NetworkEntry[]>([]);
  const [networkCapturing, setNetworkCapturing] = useState(false);
  const networkIdRef = useRef(0);

  // Storage
  const [storageTab, setStorageTab] = useState<'localStorage' | 'sessionStorage' | 'cookies'>('localStorage');
  const [storageData, setStorageData] = useState<any>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // Eval
  const [evalCode, setEvalCode] = useState('document.title');
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Extension logs
  const [extLogs, setExtLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const [gwConnected, setGwConnected] = useState<boolean | null>(null);

  // Clean
  const [cleanLoading, setCleanLoading] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Poll devices & gateway health
  // ---------------------------------------------------------------------------

  const refreshDevices = useCallback(async () => {
    try {
      const res = await gw.devices();
      setDevicesData(res);
      setGwConnected(true);
      return res;
    } catch {
      setGwConnected(false);
      return null;
    }
  }, []);

  useEffect(() => {
    setDeviceLoading(true);
    refreshDevices().then(res => {
      setDeviceLoading(false);
      const flat = flatDevices(res);
      if (flat.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(flat[0].deviceId);
      }
    });
    const interval = setInterval(async () => {
      const res = await refreshDevices();
      if (!res) return;
      const flat = flatDevices(res);
      // Log device events
      const prev = devices.map(d => d.deviceId);
      for (const d of flat) {
        if (!prev.includes(d.deviceId)) {
          const id = logIdRef.current++;
          const entry: LogEntry = { id, ts: ts(), level: 'ok', message: `Device connected: ${d.title || d.url} (#${d.tabId})` };
          setExtLogs(prev => [entry, ...prev].slice(0, 200));
        }
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select first device
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [devices, selectedDeviceId]);

  // ---------------------------------------------------------------------------
  // Network capture
  // ---------------------------------------------------------------------------

  const startNetworkCapture = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const res = await gw.network(selectedDeviceId, 'start');
      setNetworkCapturing(true);
      setNetworkEntries([]);
      const id = logIdRef.current++;
      setExtLogs(prev => [
        { id, ts: ts(), level: 'info', message: `Network capture started on ${selectedDeviceId}` },
        ...prev,
      ]);
      // If the response already has entries, show them
      if (res?.entries) {
        setNetworkEntries(
          res.entries.map((e: any) => ({
            id: networkIdRef.current++,
            ts: ts(),
            ...e,
          })),
        );
      }
    } catch (e: any) {
      const id = logIdRef.current++;
      setExtLogs(prev => [
        { id, ts: ts(), level: 'error', message: `Network capture failed: ${e.message}` },
        ...prev,
      ]);
    }
  }, [selectedDeviceId]);

  const stopNetworkCapture = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const res = await gw.network(selectedDeviceId, 'stop');
      setNetworkCapturing(false);
      // Append any final entries
      if (res?.entries) {
        setNetworkEntries(prev => [
          ...prev,
          ...res.entries.map((e: any) => ({ id: networkIdRef.current++, ts: ts(), ...e })),
        ]);
      }
    } catch {
      setNetworkCapturing(false);
    }
  }, [selectedDeviceId]);

  const pollNetwork = useCallback(async () => {
    if (!selectedDeviceId || !networkCapturing) return;
    try {
      const res = await gw.network(selectedDeviceId, 'get');
      if (res?.entries?.length) {
        setNetworkEntries(prev => [
          ...prev,
          ...res.entries.map((e: any) => ({ id: networkIdRef.current++, ts: ts(), ...e })),
        ]);
      }
    } catch {}
  }, [selectedDeviceId, networkCapturing]);

  useEffect(() => {
    if (!networkCapturing) return;
    const interval = setInterval(pollNetwork, 2000);
    return () => clearInterval(interval);
  }, [networkCapturing, pollNetwork]);

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  const fetchStorage = useCallback(async (store?: string) => {
    if (!selectedDeviceId) return;
    const storeName = store ?? storageTab;
    setStorageLoading(true);
    setStorageData(null);
    try {
      const res = await gw.storage(selectedDeviceId, 'get', storeName);
      setStorageData(res);
    } catch (e: any) {
      setStorageData({ error: e.message });
    } finally {
      setStorageLoading(false);
    }
  }, [selectedDeviceId, storageTab]);

  useEffect(() => {
    if (tab === 'storage' && selectedDeviceId) {
      fetchStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDeviceId, storageTab]);

  // ---------------------------------------------------------------------------
  // Eval
  // ---------------------------------------------------------------------------

  const runEval = useCallback(async () => {
    if (!selectedDeviceId || !evalCode.trim() || evalLoading) return;
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const res = await gw.evalJs(selectedDeviceId, evalCode);
      setEvalResult(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
    } catch (e: any) {
      setEvalResult(`Error: ${e.message}`);
    } finally {
      setEvalLoading(false);
    }
  }, [selectedDeviceId, evalCode, evalLoading]);

  // ---------------------------------------------------------------------------
  // Clean
  // ---------------------------------------------------------------------------

  const runClean = useCallback(async () => {
    if (!selectedDeviceId || cleanLoading) return;
    setCleanLoading(true);
    setCleanResult(null);
    try {
      const res = await gw.clean(selectedDeviceId);
      setCleanResult(JSON.stringify(res, null, 2));
      const id = logIdRef.current++;
      setExtLogs(prev => [
        { id, ts: ts(), level: 'ok', message: `Clean page executed on ${selectedDeviceId}` },
        ...prev,
      ]);
    } catch (e: any) {
      setCleanResult(`Error: ${e.message}`);
    } finally {
      setCleanLoading(false);
    }
  }, [selectedDeviceId, cleanLoading]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statusColor = gwConnected === true ? 'text-accent-green' : gwConnected === false ? 'text-health-offline' : 'text-dim';
  const statusIcon = gwConnected === true ? <Wifi size={13} /> : gwConnected === false ? <WifiOff size={13} /> : <Activity size={13} />;
  const statusText = gwConnected === true ? 'Connected' : gwConnected === false ? 'Disconnected' : 'Checking...';

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg flex items-center gap-2">
            <Terminal size={20} className="text-accent-cyan" /> Developer Tools
          </h1>
          <p className="text-sm text-muted mt-0.5">Network inspector, storage viewer, JS eval & more</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${statusColor}`}>
          {statusIcon}
          <span>{statusText}</span>
        </div>
      </div>

      {/* Device selector bar */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-dim flex items-center gap-1.5">
            <MonitorSmartphone size={13} /> Devices
          </h2>
          <button
            onClick={() => refreshDevices()}
            className="text-muted hover:text-fg transition-colors"
            title="Refresh devices"
          >
            <RefreshCcw size={13} />
          </button>
        </div>
        {deviceLoading ? (
          <div className="text-xs text-muted animate-pulse">Scanning for devices...</div>
        ) : devices.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <MonitorSmartphone size={24} className="mx-auto text-dim mb-2" />
            <div className="text-sm text-muted">No devices connected</div>
            <div className="text-xs text-dim mt-1">Install the PingOS extension and open a tab</div>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {devices.map(d => (
              <DeviceChip
                key={d.deviceId}
                device={d}
                selected={d.deviceId === selectedDeviceId}
                onClick={() => setSelectedDeviceId(d.deviceId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Main tabs */}
      {selectedDevice && (
        <>
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {([
              { key: 'network' as const, icon: <Network size={12} />, label: 'Network' },
              { key: 'storage' as const, icon: <Database size={12} />, label: 'Storage' },
              { key: 'logs' as const, icon: <Activity size={12} />, label: 'Extension Logs' },
              { key: 'eval' as const, icon: <Terminal size={12} />, label: 'Quick Eval' },
              { key: 'clean' as const, icon: <Sparkles size={12} />, label: 'Clean' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-accent-cyan text-accent-cyan'
                    : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ---- Network ---- */}
          {tab === 'network' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center gap-3">
                {!networkCapturing ? (
                  <button
                    onClick={startNetworkCapture}
                    className="flex items-center gap-2 rounded-lg bg-accent-green/15 px-4 py-2 text-sm font-medium text-accent-green hover:bg-accent-green/25 transition-colors"
                  >
                    <Play size={13} /> Start Capture
                  </button>
                ) : (
                  <button
                    onClick={stopNetworkCapture}
                    className="flex items-center gap-2 rounded-lg bg-health-offline/15 px-4 py-2 text-sm font-medium text-health-offline hover:bg-health-offline/25 transition-colors"
                  >
                    <AlertCircle size={13} /> Stop Capture
                  </button>
                )}
                {networkCapturing && (
                  <div className="flex items-center gap-1.5 text-xs text-accent-green animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                    Recording...
                  </div>
                )}
                <span className="text-xs text-dim ml-auto">{networkEntries.length} requests</span>
              </div>

              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[60px_1fr_70px_100px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-dim font-medium border-b border-border bg-bg">
                  <span>Method</span>
                  <span>URL</span>
                  <span>Status</span>
                  <span>Time</span>
                </div>
                <div className="max-h-[380px] overflow-y-auto">
                  {networkEntries.length === 0 ? (
                    <div className="text-xs text-muted text-center py-8">
                      {networkCapturing ? 'Waiting for requests...' : 'Start a capture to see network requests'}
                    </div>
                  ) : (
                    <AnimatePresence>
                      {networkEntries.map(entry => {
                        const statusColor =
                          !entry.status ? 'text-dim'
                          : entry.status < 300 ? 'text-accent-green'
                          : entry.status < 400 ? 'text-accent-cyan'
                          : entry.status < 500 ? 'text-health-degraded'
                          : 'text-health-offline';
                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="grid grid-cols-[60px_1fr_70px_100px] gap-2 px-3 py-2 text-xs border-b border-border/50 hover:bg-white/[0.02]"
                          >
                            <span className="font-bold text-accent-cyan uppercase text-[10px]">
                              {entry.method ?? 'GET'}
                            </span>
                            <span className="text-fg truncate font-mono text-[11px]">{entry.url ?? '—'}</span>
                            <span className={`font-medium ${statusColor}`}>{entry.status ?? '—'}</span>
                            <span className="text-dim">{entry.ts}</span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- Storage ---- */}
          {tab === 'storage' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex gap-1">
                {(['localStorage', 'sessionStorage', 'cookies'] as const).map(s => {
                  const icon =
                    s === 'localStorage' ? <HardDrive size={11} />
                    : s === 'sessionStorage' ? <Database size={11} />
                    : <Cookie size={11} />;
                  return (
                    <button
                      key={s}
                      onClick={() => setStorageTab(s)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        storageTab === s
                          ? 'bg-accent-cyan/15 text-accent-cyan'
                          : 'bg-surface text-muted hover:text-fg border border-border'
                      }`}
                    >
                      {icon} {s}
                    </button>
                  );
                })}
                <button
                  onClick={() => fetchStorage()}
                  className="ml-auto text-muted hover:text-fg transition-colors"
                  title="Refresh"
                >
                  <RefreshCcw size={13} />
                </button>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                {storageLoading ? (
                  <div className="text-sm text-muted animate-pulse">Loading {storageTab}...</div>
                ) : !storageData ? (
                  <div className="text-sm text-muted text-center py-4">No data</div>
                ) : storageData.error ? (
                  <div className="text-sm text-health-offline">{storageData.error}</div>
                ) : typeof storageData === 'object' && !Array.isArray(storageData) ? (
                  <div className="space-y-1 max-h-[380px] overflow-y-auto">
                    {Object.entries(storageData.data ?? storageData).length === 0 ? (
                      <div className="text-xs text-muted text-center py-4">Empty</div>
                    ) : (
                      Object.entries(storageData.data ?? storageData).map(([key, val]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[200px_1fr] gap-3 rounded-md bg-bg border border-border px-3 py-2"
                        >
                          <span className="text-xs text-accent-cyan font-mono truncate">{key}</span>
                          <span className="text-xs text-fg font-mono truncate">
                            {typeof val === 'string' ? val : JSON.stringify(val)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <pre className="text-xs text-fg whitespace-pre-wrap font-mono max-h-[380px] overflow-y-auto">
                    {JSON.stringify(storageData, null, 2)}
                  </pre>
                )}
              </div>
            </motion.div>
          )}

          {/* ---- Extension Logs ---- */}
          {tab === 'logs' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 text-xs ${statusColor}`}>
                    {statusIcon}
                    <span>Gateway: {statusText}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {devices.length} device{devices.length !== 1 ? 's' : ''} connected
                  </div>
                </div>
                <button
                  onClick={() => setExtLogs([])}
                  className="flex items-center gap-1 text-xs text-muted hover:text-fg transition-colors"
                >
                  <Trash2 size={11} /> Clear
                </button>
              </div>

              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  {extLogs.length === 0 ? (
                    <div className="text-xs text-muted text-center py-8">
                      No events yet. Device connections and operations will appear here.
                    </div>
                  ) : (
                    extLogs.map(log => {
                      const color =
                        log.level === 'ok' ? 'text-accent-green'
                        : log.level === 'warn' ? 'text-health-degraded'
                        : log.level === 'error' ? 'text-health-offline'
                        : 'text-muted';
                      const icon =
                        log.level === 'ok' ? <CheckCircle size={12} />
                        : log.level === 'error' ? <AlertCircle size={12} />
                        : <ArrowRight size={12} />;
                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-2 px-3 py-2 text-xs border-b border-border/50"
                        >
                          <span className="text-dim shrink-0 font-mono">{log.ts}</span>
                          <span className={`shrink-0 ${color}`}>{icon}</span>
                          <span className="text-fg">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- Quick Eval ---- */}
          {tab === 'eval' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Terminal size={14} className="text-accent-cyan" />
                  <span className="text-xs font-medium text-muted uppercase tracking-wider">
                    JavaScript Eval on {selectedDevice.title || selectedDevice.url}
                  </span>
                </div>
                <textarea
                  value={evalCode}
                  onChange={e => setEvalCode(e.target.value)}
                  rows={8}
                  placeholder="Enter JavaScript expression..."
                  spellCheck={false}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg font-mono placeholder:text-dim outline-none focus:border-accent-cyan/50 transition-colors resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={runEval}
                    disabled={evalLoading || !evalCode.trim()}
                    className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play size={13} />
                    {evalLoading ? 'Running...' : 'Run'}
                  </button>
                  <button
                    onClick={() => { setEvalCode(''); setEvalResult(null); }}
                    className="text-xs text-muted hover:text-fg transition-colors px-2"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {evalResult !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-dim font-medium mb-2">Result</div>
                    <pre className="text-xs text-fg whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono bg-bg rounded-md p-3 border border-border">
                      {evalResult}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ---- Clean ---- */}
          {tab === 'clean' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-6 text-center space-y-3">
                <Sparkles size={28} className="mx-auto text-accent-cyan" />
                <div>
                  <div className="text-sm font-medium text-fg">Clean Page</div>
                  <div className="text-xs text-muted mt-1">
                    Removes overlays, modals, cookie banners, and other junk from the current page on{' '}
                    <span className="text-accent-cyan">{selectedDevice.title || selectedDevice.url}</span>
                  </div>
                </div>
                <button
                  onClick={runClean}
                  disabled={cleanLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 px-5 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Sparkles size={14} />
                  {cleanLoading ? 'Cleaning...' : 'Clean Page'}
                </button>
              </div>

              <AnimatePresence>
                {cleanResult !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-dim font-medium mb-2">Result</div>
                    <pre className="text-xs text-fg whitespace-pre-wrap leading-relaxed font-mono bg-bg rounded-md p-3 border border-border">
                      {cleanResult}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
