import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box,
  Plus,
  Loader2,
  X,
  Globe,
  Zap,
  ShoppingCart,
  MessageSquare,
  Search,
  Database,
  Mail,
  Music,
  Video,
  Newspaper,
  Cloud,
  Terminal,
  Code,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Color / Icon mapping for known app names
// ---------------------------------------------------------------------------

const APP_THEME: Record<string, { color: string; glow: string; icon: React.ComponentType<{ className?: string }> }> = {
  google:    { color: 'text-blue-400',   glow: 'shadow-[0_0_20px_rgba(96,165,250,0.2)]',  icon: Search },
  search:    { color: 'text-blue-400',   glow: 'shadow-[0_0_20px_rgba(96,165,250,0.2)]',  icon: Search },
  amazon:    { color: 'text-amber-400',  glow: 'shadow-[0_0_20px_rgba(251,191,36,0.2)]',  icon: ShoppingCart },
  shop:      { color: 'text-amber-400',  glow: 'shadow-[0_0_20px_rgba(251,191,36,0.2)]',  icon: ShoppingCart },
  twitter:   { color: 'text-sky-400',    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.2)]',  icon: MessageSquare },
  chat:      { color: 'text-green-400',  glow: 'shadow-[0_0_20px_rgba(74,222,128,0.2)]',  icon: MessageSquare },
  youtube:   { color: 'text-red-400',    glow: 'shadow-[0_0_20px_rgba(248,113,113,0.2)]', icon: Video },
  video:     { color: 'text-red-400',    glow: 'shadow-[0_0_20px_rgba(248,113,113,0.2)]', icon: Video },
  spotify:   { color: 'text-green-400',  glow: 'shadow-[0_0_20px_rgba(74,222,128,0.2)]',  icon: Music },
  music:     { color: 'text-green-400',  glow: 'shadow-[0_0_20px_rgba(74,222,128,0.2)]',  icon: Music },
  email:     { color: 'text-violet-400', glow: 'shadow-[0_0_20px_rgba(167,139,250,0.2)]', icon: Mail },
  gmail:     { color: 'text-violet-400', glow: 'shadow-[0_0_20px_rgba(167,139,250,0.2)]', icon: Mail },
  news:      { color: 'text-orange-400', glow: 'shadow-[0_0_20px_rgba(251,146,60,0.2)]',  icon: Newspaper },
  database:  { color: 'text-cyan-400',   glow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]',  icon: Database },
  api:       { color: 'text-cyan-400',   glow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]',  icon: Code },
  cloud:     { color: 'text-indigo-400', glow: 'shadow-[0_0_20px_rgba(129,140,248,0.2)]', icon: Cloud },
  terminal:  { color: 'text-lime-400',   glow: 'shadow-[0_0_20px_rgba(163,230,53,0.2)]',  icon: Terminal },
};

function getAppTheme(name: string) {
  const lower = name.toLowerCase();
  for (const [key, theme] of Object.entries(APP_THEME)) {
    if (lower.includes(key)) return theme;
  }
  return { color: 'text-accent-cyan', glow: 'shadow-glow-cyan', icon: Box };
}

// ---------------------------------------------------------------------------
// App Card
// ---------------------------------------------------------------------------

function AppCard({ app, onClick }: { app: gw.PingAppDef; onClick: () => void }) {
  const theme = getAppTheme(app.name);
  const Icon = theme.icon;

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border border-border bg-surface p-5
        hover:border-border/80 transition-all cursor-pointer
        hover:${theme.glow}
      `}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg bg-bg border border-border flex items-center justify-center ${theme.color} flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-fg font-semibold text-sm">{app.name}</div>
          <div className="text-muted text-xs mt-1 line-clamp-2">
            {app.description || 'No description'}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-cyan/10 border border-accent-cyan/20 px-2 py-0.5 text-[11px] text-accent-cyan font-medium">
              <Zap className="w-3 h-3" />
              {app.functions?.length ?? 0} function{(app.functions?.length ?? 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Generate Modal
// ---------------------------------------------------------------------------

function GenerateModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all';

  const handleGenerate = async () => {
    if (!url.trim() || !description.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await gw.generateApp(url.trim(), description.trim());
      setResult(res);
      onGenerated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-fg">Generate PingApp</h2>
            <p className="text-xs text-dim mt-0.5">Point at a URL and describe what you want.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-border/50 text-dim hover:text-fg transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-1.5">Target URL</label>
            <input
              className={inputCls}
              placeholder="https://example.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-1.5">Description</label>
            <textarea
              className={inputCls + ' min-h-[80px]'}
              placeholder="Describe the app functions you want to generate..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-health-offline/30 bg-health-offline/5 px-3 py-2 text-xs text-health-offline">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-xs text-accent-green">
              App generated successfully!
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:bg-border/30 transition cursor-pointer"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleGenerate}
              disabled={loading || !url.trim() || !description.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-4 py-2 text-sm text-accent-cyan font-medium hover:bg-accent-cyan/25 transition disabled:opacity-40 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PingApps Page
// ---------------------------------------------------------------------------

export function PingAppsPage() {
  const [apps, setApps] = useState<gw.PingAppDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const fetchApps = useCallback(async () => {
    try {
      const res = await gw.listApps();
      const list = Array.isArray(res) ? res : (res as any)?.apps ?? [];
      setApps(list);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const filtered = searchTerm.trim()
    ? apps.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : apps;

  const totalFunctions = apps.reduce((sum, a) => sum + (a.functions?.length ?? 0), 0);

  return (
    <div className="page">
      {/* Hero */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">PingApp Marketplace</h1>
            <p className="text-muted text-sm mt-1">
              {apps.length} app{apps.length !== 1 ? 's' : ''} · {totalFunctions} total functions
            </p>
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 rounded-lg bg-accent-green/15 border border-accent-green/30 px-4 py-2.5 text-sm font-medium text-accent-green hover:bg-accent-green/25 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Generate New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
          <input
            className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan/50 focus:shadow-glow-cyan transition-all"
            placeholder="Search apps..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-health-offline/30 bg-health-offline/5 px-4 py-3 text-sm text-health-offline">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-dim">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading apps...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Box className="w-12 h-12 text-dim mb-4" />
          <div className="text-fg font-medium">
            {searchTerm ? 'No apps match your search' : 'No PingApps found'}
          </div>
          <div className="text-dim text-sm mt-1">
            {searchTerm ? 'Try a different search term.' : 'Generate your first PingApp to get started.'}
          </div>
          {!searchTerm && (
            <button
              onClick={() => setShowGenerate(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-4 py-2 text-sm text-accent-cyan hover:bg-accent-cyan/25 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Generate App
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map(app => (
              <AppCard
                key={app.name}
                app={app}
                onClick={() => navigate(`/apps/${encodeURIComponent(app.name)}`)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Generate Modal */}
      <AnimatePresence>
        {showGenerate && (
          <GenerateModal
            onClose={() => setShowGenerate(false)}
            onGenerated={fetchApps}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
