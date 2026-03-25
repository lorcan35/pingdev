import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe, Camera, Search, Wand2, Rocket, ChevronRight, Loader2,
  AlertCircle, CheckCircle2, Copy, Monitor, RefreshCw,
} from 'lucide-react';
import * as gw from '../lib/gw';

type Step = 'URL' | 'SNAPSHOT' | 'ANALYZE' | 'GENERATE' | 'DEPLOY';

const STEPS: { key: Step; label: string; icon: typeof Globe; desc: string }[] = [
  { key: 'URL',      label: 'Target',   icon: Globe,   desc: 'Paste a URL' },
  { key: 'SNAPSHOT', label: 'Snapshot',  icon: Camera,  desc: 'Navigate & capture' },
  { key: 'ANALYZE',  label: 'Analyze',   icon: Search,  desc: 'Discover page structure' },
  { key: 'GENERATE', label: 'Generate',  icon: Wand2,   desc: 'Build PingApp definition' },
  { key: 'DEPLOY',   label: 'Deploy',    icon: Rocket,  desc: 'Review & copy output' },
];

const stepIdx = (s: Step) => STEPS.findIndex(x => x.key === s);

export function ReconPage() {
  // --- state -----------------------------------------------------------------
  const [step, setStep] = useState<Step>('URL');
  const [url, setUrl] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<gw.Device[]>([]);
  const [devLoading, setDevLoading] = useState(false);

  // per-step results
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapResult, setSnapResult] = useState<any>(null);
  const [snapError, setSnapError] = useState('');

  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [analyzeError, setAnalyzeError] = useState('');

  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [genError, setGenError] = useState('');

  const [copied, setCopied] = useState(false);

  const validUrl = useMemo(() => url.trim().startsWith('http'), [url]);

  // --- load devices ----------------------------------------------------------
  const fetchDevices = useCallback(async () => {
    setDevLoading(true);
    try {
      const resp = await gw.devices();
      const devs = resp.extension?.devices ?? [];
      setDevices(devs);
      if (devs.length && !deviceId) setDeviceId(devs[0].deviceId);
    } catch { /* silent */ }
    setDevLoading(false);
  }, [deviceId]);

  useEffect(() => { fetchDevices(); }, []);

  // --- step handlers ---------------------------------------------------------
  const runSnapshot = async () => {
    if (!deviceId || !validUrl) return;
    setSnapLoading(true);
    setSnapError('');
    setSnapResult(null);
    try {
      await gw.navigate(deviceId, url.trim());
      // brief settle
      await new Promise(r => setTimeout(r, 1500));
      const shot = await gw.screenshot(deviceId);
      setSnapResult(shot);
      setStep('SNAPSHOT');
    } catch (e: any) {
      setSnapError(e.message ?? 'Snapshot failed');
    }
    setSnapLoading(false);
  };

  const runAnalyze = async () => {
    if (!deviceId) return;
    setAnalyzeLoading(true);
    setAnalyzeError('');
    setAnalyzeResult(null);
    try {
      const res = await gw.discover(deviceId);
      setAnalyzeResult(res);
      setStep('ANALYZE');
    } catch (e: any) {
      setAnalyzeError(e.message ?? 'Analysis failed');
    }
    setAnalyzeLoading(false);
  };

  const runGenerate = async () => {
    if (!validUrl) return;
    setGenLoading(true);
    setGenError('');
    setGenResult(null);
    try {
      const desc = analyzeResult?.description ?? analyzeResult?.pageType ?? 'Web application';
      const res = await gw.generateApp(url.trim(), desc);
      setGenResult(res);
      setStep('GENERATE');
    } catch (e: any) {
      setGenError(e.message ?? 'Generation failed');
    }
    setGenLoading(false);
  };

  const copyJson = () => {
    if (!genResult) return;
    navigator.clipboard.writeText(JSON.stringify(genResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- navigation helpers ----------------------------------------------------
  const goStep = (s: Step) => {
    if (stepIdx(s) > stepIdx(step) + 1) return; // can't skip ahead
    setStep(s);
  };

  const canGoNext = () => {
    if (step === 'URL') return validUrl && !!deviceId;
    if (step === 'SNAPSHOT') return !!snapResult;
    if (step === 'ANALYZE') return !!analyzeResult;
    if (step === 'GENERATE') return !!genResult;
    return false;
  };

  // --- render ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Recon</h1>
        <p className="text-zinc-500 mt-1">Turn any website into a PingApp definition.</p>
      </div>

      <div className="max-w-5xl mx-auto space-y-6">

        {/* Device selector bar */}
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
          <Monitor className="w-4 h-4 text-zinc-500 shrink-0" />
          <select
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none cursor-pointer"
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
          >
            {devices.length === 0 && <option value="">No devices found</option>}
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.title || d.url || d.deviceId} (tab {d.tabId})
              </option>
            ))}
          </select>
          <button
            onClick={fetchDevices}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            title="Refresh devices"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${devLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const active = step === s.key;
            const done = stepIdx(step) > i;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex items-center">
                {i > 0 && <ChevronRight className="w-4 h-4 text-zinc-700 mx-1 shrink-0" />}
                <button
                  onClick={() => goStep(s.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    active
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : done
                        ? 'bg-zinc-800 text-emerald-400 hover:bg-zinc-700'
                        : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'
                  }`}
                >
                  {done && !active ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  {s.label}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: URL ──────────────────────────────────────────────────── */}
        {step === 'URL' && (
          <Panel title="Target URL" sub="Paste the URL you want to reverse-engineer.">
            <div className="flex gap-3">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors"
                onKeyDown={e => e.key === 'Enter' && validUrl && deviceId && (runSnapshot(), setStep('SNAPSHOT'))}
              />
              <button
                disabled={!validUrl || !deviceId}
                onClick={() => { runSnapshot(); setStep('SNAPSHOT'); }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {!deviceId && devices.length === 0 && (
              <StatusBadge type="warn" msg="No devices connected. Connect a browser extension first." />
            )}
          </Panel>
        )}

        {/* ── STEP 2: SNAPSHOT ─────────────────────────────────────────────── */}
        {step === 'SNAPSHOT' && (
          <Panel title="Snapshot" sub={`Navigate to ${url} and capture the page.`}>
            <div className="flex gap-3 mb-4">
              <button
                onClick={runSnapshot}
                disabled={snapLoading}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {snapLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {snapLoading ? 'Capturing...' : 'Re-capture'}
              </button>
              <button
                onClick={() => { setStep('ANALYZE'); runAnalyze(); }}
                disabled={!snapResult}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                Analyze <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {snapError && <StatusBadge type="error" msg={snapError} />}

            {snapResult && (
              <div className="space-y-3">
                <StatusBadge type="ok" msg="Screenshot captured successfully." />
                {snapResult.screenshot && (
                  <img
                    src={`data:image/png;base64,${snapResult.screenshot}`}
                    alt="Page screenshot"
                    className="rounded-lg border border-zinc-800 max-h-[400px] w-auto"
                  />
                )}
                {snapResult.url && (
                  <p className="text-xs text-zinc-500 font-mono">{snapResult.url}</p>
                )}
                {!snapResult.screenshot && (
                  <CodeBlock data={snapResult} />
                )}
              </div>
            )}

            {snapLoading && !snapResult && (
              <div className="flex items-center gap-3 text-zinc-400 text-sm py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Navigating and capturing screenshot...
              </div>
            )}
          </Panel>
        )}

        {/* ── STEP 3: ANALYZE ──────────────────────────────────────────────── */}
        {step === 'ANALYZE' && (
          <Panel title="Analyze" sub="Discover page structure, selectors, and available actions.">
            <div className="flex gap-3 mb-4">
              <button
                onClick={runAnalyze}
                disabled={analyzeLoading}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {analyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {analyzeLoading ? 'Analyzing...' : 'Re-analyze'}
              </button>
              <button
                onClick={() => { setStep('GENERATE'); runGenerate(); }}
                disabled={!analyzeResult}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                Generate <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {analyzeError && <StatusBadge type="error" msg={analyzeError} />}

            {analyzeLoading && !analyzeResult && (
              <div className="flex items-center gap-3 text-zinc-400 text-sm py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Running page discovery...
              </div>
            )}

            {analyzeResult && (
              <div className="space-y-4">
                <StatusBadge type="ok" msg="Page analysis complete." />

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MiniCard label="Page type" value={analyzeResult.pageType ?? analyzeResult.type ?? '—'} />
                  <MiniCard label="Forms" value={String(analyzeResult.forms?.length ?? analyzeResult.inputs?.length ?? '—')} />
                  <MiniCard label="Links" value={String(analyzeResult.links?.length ?? analyzeResult.navigation?.length ?? '—')} />
                  <MiniCard label="Actions" value={String(analyzeResult.actions?.length ?? analyzeResult.buttons?.length ?? '—')} />
                </div>

                <details className="group">
                  <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                    Raw discovery result
                  </summary>
                  <div className="mt-2">
                    <CodeBlock data={analyzeResult} />
                  </div>
                </details>
              </div>
            )}
          </Panel>
        )}

        {/* ── STEP 4: GENERATE ─────────────────────────────────────────────── */}
        {step === 'GENERATE' && (
          <Panel title="Generate PingApp" sub="Create a PingApp definition from the analysis.">
            <div className="flex gap-3 mb-4">
              <button
                onClick={runGenerate}
                disabled={genLoading}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {genLoading ? 'Generating...' : 'Re-generate'}
              </button>
              <button
                onClick={() => setStep('DEPLOY')}
                disabled={!genResult}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                Deploy <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {genError && <StatusBadge type="error" msg={genError} />}

            {genLoading && !genResult && (
              <div className="flex items-center gap-3 text-zinc-400 text-sm py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating PingApp definition via LLM...
              </div>
            )}

            {genResult && (
              <div className="space-y-3">
                <StatusBadge type="ok" msg="PingApp definition generated." />
                <CodeBlock data={genResult} />
              </div>
            )}
          </Panel>
        )}

        {/* ── STEP 5: DEPLOY ───────────────────────────────────────────────── */}
        {step === 'DEPLOY' && (
          <Panel title="Deploy" sub="Review the generated PingApp and copy.">
            {genResult ? (
              <div className="space-y-4">
                {/* Summary */}
                {genResult.name && (
                  <div className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
                    <Rocket className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{genResult.name}</p>
                      {genResult.description && <p className="text-xs text-zinc-500">{genResult.description}</p>}
                    </div>
                  </div>
                )}

                {/* Functions count */}
                {genResult.functions && (
                  <p className="text-sm text-zinc-400">
                    {genResult.functions.length} function{genResult.functions.length !== 1 ? 's' : ''} defined
                  </p>
                )}

                {/* JSON output */}
                <div className="relative">
                  <button
                    onClick={copyJson}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors z-10"
                    title="Copy JSON"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-zinc-300" />
                    )}
                  </button>
                  <CodeBlock data={genResult} />
                </div>

                {copied && (
                  <StatusBadge type="ok" msg="Copied to clipboard!" />
                )}

                {/* Start over */}
                <button
                  onClick={() => {
                    setStep('URL');
                    setSnapResult(null);
                    setSnapError('');
                    setAnalyzeResult(null);
                    setAnalyzeError('');
                    setGenResult(null);
                    setGenError('');
                    setUrl('');
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Start new recon
                </button>
              </div>
            ) : (
              <StatusBadge type="warn" msg="No generated definition yet. Go back and run Generate first." />
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{sub}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatusBadge({ type, msg }: { type: 'ok' | 'error' | 'warn'; msg: string }) {
  const styles = {
    ok:    'bg-emerald-950/50 border-emerald-800 text-emerald-300',
    error: 'bg-red-950/50 border-red-800 text-red-300',
    warn:  'bg-amber-950/50 border-amber-800 text-amber-300',
  };
  const icons = {
    ok:    <CheckCircle2 className="w-4 h-4 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 shrink-0" />,
    warn:  <AlertCircle className="w-4 h-4 shrink-0" />,
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${styles[type]}`}>
      {icons[type]}
      {msg}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-200 mt-0.5">{value}</p>
    </div>
  );
}

function CodeBlock({ data }: { data: unknown }) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-300 font-mono overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}
