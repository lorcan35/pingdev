import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Play,
  Download,
  Upload,
  Table2,
  GitCompareArrows,
  Sparkles,
  FileJson,
  Loader2,
  Copy,
  Check,
  X,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaField {
  id: string;
  name: string;
  selector: string;
}

// ---------------------------------------------------------------------------
// JSON viewer — just a <pre> with syntax highlighting via spans
// ---------------------------------------------------------------------------

function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Simple syntax highlight
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
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-accent-cyan" />}
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-xs text-dim mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ExtractionStudioPage() {
  // Devices
  const [devices, setDevices] = useState<gw.Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  // Schema builder
  const [fields, setFields] = useState<SchemaField[]>([
    { id: crypto.randomUUID(), name: '', selector: '' },
  ]);
  const [extractResult, setExtractResult] = useState<any>(null);
  const [extractLoading, setExtractLoading] = useState(false);

  // Semantic
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResult, setSemanticResult] = useState<any>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<gw.TemplateInfo[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Diff
  const [diffResult, setDiffResult] = useState<any>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Table
  const [tableSel, setTableSel] = useState('');
  const [tableResult, setTableResult] = useState<any>(null);
  const [tableLoading, setTableLoading] = useState(false);

  // Results panel
  const [activeResult, setActiveResult] = useState<{ label: string; data: any } | null>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all';

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await gw.devices();
      setDevices(res?.extension?.devices ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await gw.listTemplates();
      setTemplates(res?.templates ?? []);
    } catch { /* ignore */ }
    finally { setTemplatesLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Schema field helpers
  const addField = () => setFields(f => [...f, { id: crypto.randomUUID(), name: '', selector: '' }]);
  const removeField = (id: string) => setFields(f => f.filter(x => x.id !== id));
  const updateField = (id: string, key: 'name' | 'selector', value: string) =>
    setFields(f => f.map(x => x.id === id ? { ...x, [key]: value } : x));

  // Extract with schema
  const handleExtract = async () => {
    if (!selectedDevice) return;
    const schema: Record<string, string> = {};
    for (const f of fields) {
      if (f.name.trim() && f.selector.trim()) schema[f.name.trim()] = f.selector.trim();
    }
    if (Object.keys(schema).length === 0) return;
    setExtractLoading(true);
    try {
      const res = await gw.extract(selectedDevice, { fields: schema });
      setExtractResult(res);
      setActiveResult({ label: 'Schema Extraction', data: res });
    } catch (e: any) {
      setExtractResult({ error: e.message });
      setActiveResult({ label: 'Schema Extraction', data: { error: e.message } });
    } finally { setExtractLoading(false); }
  };

  // Semantic extraction
  const handleSemantic = async () => {
    if (!selectedDevice || !semanticQuery.trim()) return;
    setSemanticLoading(true);
    try {
      const res = await gw.extractSemantic(selectedDevice, semanticQuery.trim());
      setSemanticResult(res);
      setActiveResult({ label: 'Semantic Extraction', data: res });
    } catch (e: any) {
      setSemanticResult({ error: e.message });
      setActiveResult({ label: 'Semantic Extraction', data: { error: e.message } });
    } finally { setSemanticLoading(false); }
  };

  // Diff
  const handleDiff = async () => {
    if (!selectedDevice) return;
    setDiffLoading(true);
    try {
      const res = await gw.diff(selectedDevice);
      setDiffResult(res);
      setActiveResult({ label: 'Diff', data: res });
    } catch (e: any) {
      setDiffResult({ error: e.message });
      setActiveResult({ label: 'Diff', data: { error: e.message } });
    } finally { setDiffLoading(false); }
  };

  // Table
  const handleTable = async () => {
    if (!selectedDevice) return;
    setTableLoading(true);
    try {
      const res = await gw.table(selectedDevice, tableSel || undefined);
      setTableResult(res);
      setActiveResult({ label: 'Table Extraction', data: res });
    } catch (e: any) {
      setTableResult({ error: e.message });
      setActiveResult({ label: 'Table Extraction', data: { error: e.message } });
    } finally { setTableLoading(false); }
  };

  // Template export
  const handleExportTemplate = async (domain: string) => {
    try {
      const res = await gw.exportTemplate(domain);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${domain}-template.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  // Template import
  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await gw.importTemplate(data);
        fetchTemplates();
      } catch { /* ignore */ }
    };
    input.click();
  };

  // Render table data
  const renderTable = (data: any) => {
    const rows = data?.rows || data?.result?.rows || data?.data || [];
    const headers = data?.headers || data?.result?.headers || (Array.isArray(rows) && rows.length > 0 ? Object.keys(rows[0]) : []);

    if (!Array.isArray(rows) || rows.length === 0) {
      return <p className="text-dim text-sm">No table data extracted.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {(Array.isArray(headers) ? headers : []).map((h: string, i: number) => (
                <th key={i} className="text-left px-3 py-2 border-b border-border text-muted font-semibold uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, ri: number) => (
              <tr key={ri} className="hover:bg-border/20">
                {(Array.isArray(headers) ? headers : Object.keys(row)).map((h: string, ci: number) => (
                  <td key={ci} className="px-3 py-2 border-b border-border/50 text-fg">
                    {typeof row === 'object' ? String(row[h] ?? '') : String(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Extraction Studio</h1>
        <p className="text-muted text-sm mt-1">Schema-based and semantic data extraction from live pages.</p>
      </div>

      {/* Device selector */}
      <div className="mb-6">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-2">Target Device</label>
        <select
          className={inputCls + ' max-w-md'}
          value={selectedDevice}
          onChange={e => setSelectedDevice(e.target.value)}
        >
          <option value="">Select a device...</option>
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.title || d.url || d.deviceId}
            </option>
          ))}
        </select>
        {!selectedDevice && devices.length > 0 && (
          <p className="text-xs text-health-degraded mt-1">Select a device to enable extraction tools.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* Schema Builder */}
          <Section title="Schema Builder" subtitle="Define fields with CSS selectors" icon={FileJson}>
            <div className="space-y-2">
              {fields.map(f => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex gap-2 items-center"
                >
                  <input
                    className={inputCls}
                    placeholder="Field name"
                    value={f.name}
                    onChange={e => updateField(f.id, 'name', e.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="CSS selector"
                    value={f.selector}
                    onChange={e => updateField(f.id, 'selector', e.target.value)}
                  />
                  <button
                    onClick={() => removeField(f.id)}
                    className="p-2 rounded-lg text-dim hover:text-health-offline hover:bg-health-offline/10 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={addField}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg hover:border-accent-cyan/40 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Field
              </button>
              <button
                onClick={handleExtract}
                disabled={!selectedDevice || extractLoading}
                className="flex items-center gap-1.5 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-3 py-1.5 text-xs text-accent-cyan hover:bg-accent-cyan/25 transition disabled:opacity-40 cursor-pointer"
              >
                {extractLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Extract
              </button>
            </div>
          </Section>

          {/* Semantic Mode */}
          <Section title="Semantic Extraction" subtitle="Natural language query extraction" icon={Sparkles}>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="e.g. Get all product prices and names"
                value={semanticQuery}
                onChange={e => setSemanticQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSemantic(); }}
              />
              <button
                onClick={handleSemantic}
                disabled={!selectedDevice || semanticLoading || !semanticQuery.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-accent-green/15 border border-accent-green/30 px-3 py-1.5 text-xs text-accent-green hover:bg-accent-green/25 transition disabled:opacity-40 flex-shrink-0 cursor-pointer"
              >
                {semanticLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Extract
              </button>
            </div>
          </Section>

          {/* Diff & Table */}
          <div className="grid grid-cols-2 gap-4">
            <Section title="Diff View" subtitle="Before/after comparison" icon={GitCompareArrows}>
              <button
                onClick={handleDiff}
                disabled={!selectedDevice || diffLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg hover:border-accent-cyan/40 transition disabled:opacity-40 cursor-pointer"
              >
                {diffLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitCompareArrows className="w-3 h-3" />}
                Run Diff
              </button>
            </Section>

            <Section title="Table Extractor" subtitle="Extract tabular data" icon={Table2}>
              <input
                className={inputCls + ' mb-2'}
                placeholder="table selector (optional)"
                value={tableSel}
                onChange={e => setTableSel(e.target.value)}
              />
              <button
                onClick={handleTable}
                disabled={!selectedDevice || tableLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg hover:border-accent-cyan/40 transition disabled:opacity-40 cursor-pointer"
              >
                {tableLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Table2 className="w-3 h-3" />}
                Extract Table
              </button>
            </Section>
          </div>

          {/* Templates */}
          <Section title="Templates" subtitle="Saved extraction templates" icon={FileJson}>
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleImportTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg hover:border-accent-cyan/40 transition cursor-pointer"
              >
                <Upload className="w-3 h-3" /> Import
              </button>
              <button
                onClick={fetchTemplates}
                disabled={templatesLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg hover:border-accent-cyan/40 transition disabled:opacity-40 cursor-pointer"
              >
                {templatesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Refresh
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="text-dim text-xs">No templates saved yet.</p>
            ) : (
              <div className="space-y-1.5">
                {templates.map(t => (
                  <div key={t.domain} className="flex items-center justify-between rounded-lg border border-border/50 bg-bg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-fg">{t.domain}</div>
                      <div className="text-xs text-dim">
                        {Object.keys(t.fields || {}).length} fields
                        {t.learnedAt && ` · learned ${new Date(t.learnedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleExportTemplate(t.domain)}
                      className="p-1.5 rounded-md text-dim hover:text-accent-cyan transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Right column — Results */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5 sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-fg">
                  {activeResult ? activeResult.label : 'Results'}
                </h3>
                <p className="text-xs text-dim mt-0.5">
                  {activeResult ? 'Most recent extraction output' : 'Run an extraction to see results here'}
                </p>
              </div>
              {activeResult && (
                <button
                  onClick={() => setActiveResult(null)}
                  className="p-1.5 rounded-lg text-dim hover:text-fg hover:bg-border/50 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeResult ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* If this is table data, render as table */}
                {activeResult.label === 'Table Extraction' ? (
                  <div className="space-y-3">
                    {renderTable(activeResult.data)}
                    <details className="mt-3">
                      <summary className="text-xs text-dim cursor-pointer hover:text-fg">Raw JSON</summary>
                      <div className="mt-2"><JsonViewer data={activeResult.data} /></div>
                    </details>
                  </div>
                ) : (
                  <JsonViewer data={activeResult.data} />
                )}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileJson className="w-10 h-10 text-dim mb-3" />
                <p className="text-fg font-medium text-sm">No results yet</p>
                <p className="text-dim text-xs mt-1">Select a device and run an extraction.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
