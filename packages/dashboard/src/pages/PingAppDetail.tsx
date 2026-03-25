import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  Copy,
  Check,
  Zap,
  Code,
  FileJson,
  AlertCircle,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// JSON Viewer
// ---------------------------------------------------------------------------

function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const highlighted = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"([^"]+)":/g, '<span style="color:#00d4ff">"$1"</span>:')
    .replace(/: "(.*?)"/g, ': <span style="color:#00ff88">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:#ffcc00">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:#ff3b5c">$1</span>');

  return (
    <div className="relative group">
      <button
        onClick={copyToClipboard}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded-md bg-border/80 p-1.5 text-dim hover:text-fg transition cursor-pointer"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre
        className="rounded-lg bg-bg border border-border p-4 text-xs font-mono overflow-auto max-h-[400px] whitespace-pre-wrap text-fg"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Method badge
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  const colorMap: Record<string, string> = {
    GET: 'bg-accent-green/15 text-accent-green border-accent-green/30',
    POST: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
    PUT: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
    DELETE: 'bg-health-offline/15 text-health-offline border-health-offline/30',
    PATCH: 'bg-violet-400/15 text-violet-400 border-violet-400/30',
  };
  const cls = colorMap[upper] || 'bg-border text-muted border-border';

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold font-mono ${cls}`}>
      {upper}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Function Card
// ---------------------------------------------------------------------------

function FunctionCard({
  fn,
  appName,
}: {
  fn: gw.FunctionDef;
  appName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all';

  const updateParam = (name: string, value: string) => {
    setParams(prev => ({ ...prev, [name]: value }));
  };

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build param object, parsing JSON values where appropriate
      const parsed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(params)) {
        if (!val.trim()) continue;
        try {
          parsed[key] = JSON.parse(val);
        } catch {
          parsed[key] = val;
        }
      }
      const res = await gw.callFunction(appName, fn.name, parsed);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div layout className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-border/10 transition cursor-pointer"
      >
        <div className="flex-shrink-0">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-dim" />
            : <ChevronRight className="w-4 h-4 text-dim" />
          }
        </div>
        <MethodBadge method={fn.method} />
        <div className="flex-1 min-w-0">
          <div className="text-fg font-semibold text-sm">{fn.name}</div>
          <div className="text-muted text-xs mt-0.5 truncate">{fn.description || fn.path}</div>
        </div>
        <div className="text-dim text-xs font-mono flex-shrink-0">{fn.path}</div>
      </button>

      {/* Expanded section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 border-t border-border/50 space-y-4">
              {/* Path info */}
              <div className="flex items-center gap-2 text-xs">
                <Code className="w-3.5 h-3.5 text-dim" />
                <span className="font-mono text-muted">{fn.method.toUpperCase()} {fn.path}</span>
              </div>

              {/* Params */}
              {fn.params && fn.params.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Parameters</h4>
                  {fn.params.map(p => (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">{p.name}</span>
                        <span className="text-[11px] font-mono text-dim rounded-md bg-border/50 px-1.5 py-0.5">
                          {p.type}
                        </span>
                        {p.required && (
                          <span className="text-[11px] text-health-offline font-medium">required</span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-dim">{p.description}</p>
                      )}
                      <input
                        className={inputCls}
                        placeholder={`${p.name} (${p.type})`}
                        value={params[p.name] ?? ''}
                        onChange={e => updateParam(p.name, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-dim">No parameters required.</p>
              )}

              {/* Execute button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-4 py-2 text-sm text-accent-cyan font-medium hover:bg-accent-cyan/25 transition disabled:opacity-40 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Execute
                </button>
                {loading && <span className="text-xs text-dim">Running...</span>}
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-health-offline/30 bg-health-offline/5 px-4 py-3 text-sm text-health-offline flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Result */}
              {result !== null && !error && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-accent-green">Response</h4>
                  <JsonViewer data={result} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PingApp Detail Page
// ---------------------------------------------------------------------------

export function PingAppDetailPage() {
  const { appName } = useParams<{ appName: string }>();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(appName || '');

  const [functions, setFunctions] = useState<gw.FunctionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fetchFunctions = useCallback(async () => {
    if (!decodedName) return;
    setLoading(true);
    try {
      const res = await gw.appFunctions(decodedName);
      setFunctions(Array.isArray(res) ? res : []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [decodedName]);

  useEffect(() => { fetchFunctions(); }, [fetchFunctions]);

  const filtered = filter.trim()
    ? functions.filter(f =>
        f.name.toLowerCase().includes(filter.toLowerCase()) ||
        f.description?.toLowerCase().includes(filter.toLowerCase()) ||
        f.method.toLowerCase().includes(filter.toLowerCase())
      )
    : functions;

  // Group by method
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const methodCounts = methods
    .map(m => ({ method: m, count: functions.filter(f => f.method.toUpperCase() === m).length }))
    .filter(m => m.count > 0);

  return (
    <div className="page">
      {/* Back + Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/apps')}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-fg transition mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Apps
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">{decodedName}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Zap className="w-3 h-3" />
                {functions.length} function{functions.length !== 1 ? 's' : ''}
              </span>
              {methodCounts.map(m => (
                <span key={m.method} className="text-xs text-dim">
                  {m.count} {m.method}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={fetchFunctions}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-fg hover:border-accent-cyan/40 hover:shadow-glow-cyan transition-all disabled:opacity-40 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}
            Reload
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-5">
        <input
          className="w-full max-w-md rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all"
          placeholder="Filter functions by name, description, or method..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-health-offline/30 bg-health-offline/5 px-4 py-3 text-sm text-health-offline flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Functions list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-dim">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading functions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Code className="w-12 h-12 text-dim mb-4" />
          <div className="text-fg font-medium">
            {filter ? 'No functions match your filter' : 'No functions found'}
          </div>
          <div className="text-dim text-sm mt-1">
            {filter ? 'Try a different search.' : 'This app has no registered functions.'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(fn => (
              <FunctionCard key={fn.name} fn={fn} appName={decodedName} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
