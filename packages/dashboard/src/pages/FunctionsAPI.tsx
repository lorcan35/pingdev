import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, ChevronRight, ClipboardCopy, Code2, FunctionSquare, Layers,
  ListPlus, Play, Plus, Send, Trash2, X,
} from 'lucide-react';
import * as gw from '../lib/gw';
import type { FunctionDef } from '../lib/gw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCurl(app: string, fn: FunctionDef, paramValues: Record<string, string>): string {
  const base = `${window.location.origin}/gw/v1/functions/${encodeURIComponent(app)}/call`;
  const body: Record<string, unknown> = { function: fn.name };
  const params: Record<string, unknown> = {};
  for (const p of fn.params ?? []) {
    const v = paramValues[p.name];
    if (v !== undefined && v !== '') {
      params[p.name] = p.type === 'number' ? Number(v) : p.type === 'boolean' ? v === 'true' : v;
    }
  }
  if (Object.keys(params).length > 0) body.params = params;
  return `curl -X POST '${base}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body)}'`;
}

function paramDefault(type: string): string {
  if (type === 'number') return '0';
  if (type === 'boolean') return 'false';
  return '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FunctionRow({
  fn,
  isSelected,
  onSelect,
}: {
  fn: FunctionDef;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const methodColor =
    fn.method === 'GET'
      ? 'text-accent-green'
      : fn.method === 'POST'
        ? 'text-accent-cyan'
        : fn.method === 'DELETE'
          ? 'text-health-offline'
          : 'text-health-degraded';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
        isSelected
          ? 'border-accent-cyan/40 bg-accent-cyan/5 shadow-glow-cyan'
          : 'border-border bg-surface hover:border-border hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${methodColor}`}>
          {fn.method}
        </span>
        <span className="text-sm font-medium text-fg truncate">{fn.name}</span>
      </div>
      {fn.description && (
        <div className="text-xs text-muted mt-0.5 line-clamp-1">{fn.description}</div>
      )}
      {fn.path && <div className="text-[10px] text-dim mt-0.5 font-mono">{fn.path}</div>}
    </button>
  );
}

interface BatchItem {
  id: number;
  app: string;
  fn: FunctionDef;
  params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FunctionsAPI() {
  // Functions data
  const [funcMap, setFuncMap] = useState<Record<string, FunctionDef[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selection
  const [selectedApp, setSelectedApp] = useState('');
  const [selectedFn, setSelectedFn] = useState<FunctionDef | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  // Execution
  const [execResult, setExecResult] = useState<string | null>(null);
  const [execLoading, setExecLoading] = useState(false);

  // Batch
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchIdCounter, setBatchIdCounter] = useState(0);

  // Tab
  const [rightTab, setRightTab] = useState<'try' | 'batch' | 'curl'>('try');

  const appNames = useMemo(() => Object.keys(funcMap).sort(), [funcMap]);

  // Fetch functions
  useEffect(() => {
    gw.listFunctions()
      .then(data => {
        setFuncMap(data);
        const names = Object.keys(data).sort();
        if (names.length > 0) setSelectedApp(names[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Reset params when function changes
  useEffect(() => {
    if (!selectedFn) { setParamValues({}); return; }
    const defaults: Record<string, string> = {};
    for (const p of selectedFn.params ?? []) {
      defaults[p.name] = paramDefault(p.type);
    }
    setParamValues(defaults);
  }, [selectedFn]);

  const currentFunctions = funcMap[selectedApp] ?? [];

  // Execute single function
  const execute = useCallback(async () => {
    if (!selectedFn || !selectedApp || execLoading) return;
    setExecLoading(true);
    setExecResult(null);
    try {
      const params: Record<string, unknown> = {};
      for (const p of selectedFn.params ?? []) {
        const v = paramValues[p.name];
        if (v !== undefined && v !== '') {
          params[p.name] = p.type === 'number' ? Number(v) : p.type === 'boolean' ? v === 'true' : v;
        }
      }
      const res = await gw.callFunction(selectedApp, selectedFn.name, params);
      setExecResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setExecResult(`Error: ${e.message}`);
    } finally {
      setExecLoading(false);
    }
  }, [selectedFn, selectedApp, execLoading, paramValues]);

  // Add to batch
  const addToBatch = useCallback(() => {
    if (!selectedFn || !selectedApp) return;
    const id = batchIdCounter;
    setBatchIdCounter(c => c + 1);
    setBatchItems(prev => [...prev, { id, app: selectedApp, fn: selectedFn, params: { ...paramValues } }]);
  }, [selectedFn, selectedApp, paramValues, batchIdCounter]);

  // Execute batch
  const executeBatch = useCallback(async () => {
    if (batchItems.length === 0 || batchLoading) return;
    setBatchLoading(true);
    setBatchResults(null);
    try {
      // Group by app
      const grouped: Record<string, Array<{ function: string; params?: Record<string, unknown> }>> = {};
      for (const item of batchItems) {
        if (!grouped[item.app]) grouped[item.app] = [];
        const params: Record<string, unknown> = {};
        for (const p of item.fn.params ?? []) {
          const v = item.params[p.name];
          if (v !== undefined && v !== '') {
            params[p.name] = p.type === 'number' ? Number(v) : p.type === 'boolean' ? v === 'true' : v;
          }
        }
        grouped[item.app].push({ function: item.fn.name, params });
      }
      const results: any[] = [];
      for (const [app, calls] of Object.entries(grouped)) {
        const res = await gw.batchFunctions(app, calls);
        results.push({ app, results: res });
      }
      setBatchResults(results);
    } catch (e: any) {
      setBatchResults([{ error: e.message }]);
    } finally {
      setBatchLoading(false);
    }
  }, [batchItems, batchLoading]);

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-fg flex items-center gap-2">
          <FunctionSquare size={20} className="text-accent-cyan" /> Functions & API Explorer
        </h1>
        <p className="text-sm text-muted mt-0.5">Browse, test, and batch-execute registered functions</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted animate-pulse">Loading functions...</div>
      ) : error ? (
        <div className="text-sm text-health-offline">{error}</div>
      ) : appNames.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <Box size={32} className="mx-auto text-dim mb-2" />
          <div className="text-sm text-muted">No functions registered yet.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          {/* Left: Function browser */}
          <div className="space-y-3">
            {/* App selector */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {appNames.map(app => (
                <button
                  key={app}
                  onClick={() => { setSelectedApp(app); setSelectedFn(null); }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedApp === app
                      ? 'bg-accent-cyan/15 text-accent-cyan'
                      : 'bg-surface text-muted hover:text-fg border border-border'
                  }`}
                >
                  <Layers size={11} className="inline mr-1 -mt-0.5" />
                  {app}
                </button>
              ))}
            </div>

            {/* Function list */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {currentFunctions.map(fn => (
                <FunctionRow
                  key={fn.name}
                  fn={fn}
                  isSelected={selectedFn?.name === fn.name}
                  onSelect={() => setSelectedFn(fn)}
                />
              ))}
              {currentFunctions.length === 0 && (
                <div className="text-xs text-muted p-2">No functions in this app.</div>
              )}
            </div>
          </div>

          {/* Right: Detail / Try It / Batch */}
          <div className="space-y-4">
            {!selectedFn ? (
              <div className="rounded-lg border border-border bg-surface p-10 text-center">
                <ChevronRight size={28} className="mx-auto text-dim mb-2" />
                <div className="text-sm text-muted">Select a function from the list</div>
              </div>
            ) : (
              <>
                {/* Function info */}
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        selectedFn.method === 'GET'
                          ? 'bg-accent-green/10 text-accent-green'
                          : selectedFn.method === 'POST'
                            ? 'bg-accent-cyan/10 text-accent-cyan'
                            : 'bg-health-offline/10 text-health-offline'
                      }`}
                    >
                      {selectedFn.method}
                    </span>
                    <span className="text-base font-semibold text-fg">{selectedFn.name}</span>
                  </div>
                  {selectedFn.description && (
                    <p className="text-sm text-muted mb-2">{selectedFn.description}</p>
                  )}
                  <div className="font-mono text-xs text-dim bg-bg rounded-md px-2 py-1 inline-block">
                    {selectedFn.path}
                  </div>
                  {(selectedFn.params?.length ?? 0) > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-wider text-dim mb-1.5 font-medium">Parameters</div>
                      <div className="space-y-1">
                        {selectedFn.params!.map(p => (
                          <div key={p.name} className="flex items-center gap-2 text-xs">
                            <code className="text-accent-cyan">{p.name}</code>
                            <span className="text-dim">({p.type})</span>
                            {p.required && <span className="text-health-offline text-[10px]">required</span>}
                            {p.description && <span className="text-muted">— {p.description}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right tabs */}
                <div className="flex gap-1 border-b border-border">
                  {(['try', 'batch', 'curl'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setRightTab(t)}
                      className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                        rightTab === t
                          ? 'border-accent-cyan text-accent-cyan'
                          : 'border-transparent text-muted hover:text-fg'
                      }`}
                    >
                      {t === 'try' && <Play size={11} className="inline mr-1 -mt-0.5" />}
                      {t === 'batch' && <ListPlus size={11} className="inline mr-1 -mt-0.5" />}
                      {t === 'curl' && <Code2 size={11} className="inline mr-1 -mt-0.5" />}
                      {t === 'try' ? 'Try It' : t === 'curl' ? 'cURL' : 'Batch'}
                    </button>
                  ))}
                </div>

                {/* Try It panel */}
                {rightTab === 'try' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                      {(selectedFn.params?.length ?? 0) > 0 ? (
                        selectedFn.params!.map(p => (
                          <label key={p.name} className="block">
                            <div className="text-xs text-muted mb-1">
                              {p.name}
                              {p.required && <span className="text-health-offline ml-1">*</span>}
                              <span className="text-dim ml-1">({p.type})</span>
                            </div>
                            {p.type === 'boolean' ? (
                              <select
                                value={paramValues[p.name] ?? 'false'}
                                onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent-cyan/50 transition-colors"
                              >
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                            ) : (
                              <input
                                type={p.type === 'number' ? 'number' : 'text'}
                                value={paramValues[p.name] ?? ''}
                                onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                                placeholder={p.description || p.name}
                                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim outline-none focus:border-accent-cyan/50 transition-colors"
                              />
                            )}
                          </label>
                        ))
                      ) : (
                        <div className="text-xs text-muted">No parameters required.</div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={execute}
                          disabled={execLoading}
                          className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send size={13} />
                          {execLoading ? 'Running...' : 'Execute'}
                        </button>
                        <button
                          onClick={addToBatch}
                          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-fg hover:border-accent-cyan/30 transition-colors"
                        >
                          <Plus size={12} /> Add to Batch
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {execResult !== null && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="rounded-lg border border-border bg-surface p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] uppercase tracking-wider text-dim font-medium">Response</div>
                            <button
                              onClick={() => navigator.clipboard.writeText(execResult)}
                              className="text-xs text-muted hover:text-fg transition-colors flex items-center gap-1"
                            >
                              <ClipboardCopy size={11} /> Copy
                            </button>
                          </div>
                          <pre className="text-xs text-fg whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto font-mono bg-bg rounded-md p-3 border border-border">
                            {execResult}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Batch panel */}
                {rightTab === 'batch' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                      <div className="text-xs text-dim uppercase tracking-wider font-medium mb-2">
                        Batch Queue ({batchItems.length})
                      </div>

                      {batchItems.length === 0 ? (
                        <div className="text-xs text-muted py-4 text-center">
                          No items in batch. Use "Add to Batch" from the Try It tab.
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {batchItems.map((item, i) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between rounded-md bg-bg border border-border px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] text-dim">{i + 1}</span>
                                  <span className="text-xs text-accent-cyan font-medium">{item.app}</span>
                                  <span className="text-xs text-fg truncate">{item.fn.name}</span>
                                </div>
                                <button
                                  onClick={() => setBatchItems(prev => prev.filter(b => b.id !== item.id))}
                                  className="text-muted hover:text-health-offline transition-colors shrink-0 ml-2"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={executeBatch}
                              disabled={batchLoading}
                              className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <Play size={13} />
                              {batchLoading ? 'Running...' : 'Execute Batch'}
                            </button>
                            <button
                              onClick={() => { setBatchItems([]); setBatchResults(null); }}
                              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-health-offline hover:border-health-offline/30 transition-colors"
                            >
                              <Trash2 size={12} /> Clear
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <AnimatePresence>
                      {batchResults !== null && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="rounded-lg border border-border bg-surface p-4"
                        >
                          <div className="text-[10px] uppercase tracking-wider text-dim font-medium mb-2">
                            Batch Results
                          </div>
                          <pre className="text-xs text-fg whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto font-mono bg-bg rounded-md p-3 border border-border">
                            {JSON.stringify(batchResults, null, 2)}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* cURL panel */}
                {rightTab === 'curl' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-wider text-dim font-medium">
                          Equivalent cURL Command
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(buildCurl(selectedApp, selectedFn, paramValues))}
                          className="text-xs text-muted hover:text-fg transition-colors flex items-center gap-1"
                        >
                          <ClipboardCopy size={11} /> Copy
                        </button>
                      </div>
                      <pre className="text-xs text-accent-green whitespace-pre-wrap leading-relaxed font-mono bg-bg rounded-md p-3 border border-border">
                        {buildCurl(selectedApp, selectedFn, paramValues)}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
