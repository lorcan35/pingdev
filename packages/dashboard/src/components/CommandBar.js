import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApps } from '../hooks/useApps';
function score(hay, needle) {
    // Tiny fuzzy scorer: rewards ordered matches, penalizes gaps.
    const h = hay.toLowerCase();
    const n = needle.toLowerCase().trim();
    if (!n)
        return 1;
    let i = 0;
    let s = 0;
    let last = -1;
    for (const ch of n) {
        const idx = h.indexOf(ch, i);
        if (idx < 0)
            return 0;
        const gap = last < 0 ? 0 : idx - last - 1;
        s += 6 - Math.min(5, gap);
        i = idx + 1;
        last = idx;
    }
    return Math.max(1, s);
}
export function CommandBarButton({ onOpen }) {
    return (<button className="cmd-button" onClick={onOpen} title="Command Bar (Ctrl/Cmd+K)">
      <span className="cmd-dot"/>
      <span className="cmd-text">Command</span>
      <span className="cmd-kbd">
        <span className="kbd">{navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'}</span>
        <span className="kbd">K</span>
      </span>
    </button>);
}
export function CommandBar() {
    const navigate = useNavigate();
    const { apps, removeApp } = useApps();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const inputRef = useRef(null);
    const cmds = useMemo(() => {
        const out = [
            { id: 'go-apps', title: 'Go to Apps', subtitle: '/', keywords: 'home', run: () => navigate('/') },
            { id: 'go-recon', title: 'Go to Recon', subtitle: '/recon', keywords: 'scan wizard', run: () => navigate('/recon') },
            { id: 'go-logs', title: 'Go to Logs', subtitle: '/logs', keywords: 'timeline status', run: () => navigate('/logs') },
        ];
        for (const a of apps) {
            out.push({
                id: `open-${a.port}`,
                title: `Open ${a.name}`,
                subtitle: `:${a.port}`,
                keywords: `${a.name} ${a.url} ${a.port} app detail`,
                run: () => navigate(`/app/${a.port}`),
            });
            out.push({
                id: `copy-${a.port}`,
                title: `Copy ${a.name} URL`,
                subtitle: a.url,
                keywords: `copy clipboard ${a.name} ${a.url}`,
                run: async () => {
                    await navigator.clipboard.writeText(a.url);
                },
            });
            out.push({
                id: `remove-${a.port}`,
                title: `Remove ${a.name}`,
                subtitle: `Unregister :${a.port}`,
                keywords: `remove delete unregister ${a.name} ${a.port}`,
                run: () => { removeApp(a.port); },
            });
        }
        return out;
    }, [apps, navigate, removeApp]);
    const filtered = useMemo(() => {
        const needle = q.trim();
        const scored = cmds
            .map(c => {
            const hay = `${c.title} ${c.subtitle ?? ''} ${c.keywords ?? ''}`;
            return { c, s: score(hay, needle) };
        })
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12);
        return scored.map(x => x.c);
    }, [cmds, q]);
    useEffect(() => {
        const onKey = (e) => {
            const isK = e.key.toLowerCase() === 'k';
            const mod = navigator.platform.toLowerCase().includes('mac') ? e.metaKey : e.ctrlKey;
            if (mod && isK) {
                e.preventDefault();
                setOpen(true);
            }
            if (e.key === 'Escape')
                setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        if (!open)
            return;
        setQ('');
        window.setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);
    function run(cmd) {
        Promise.resolve(cmd.run()).catch(() => { });
        setOpen(false);
    }
    return (<>
      <CommandBarButton onOpen={() => setOpen(true)}/>
      {open && (<div className="cmd-overlay" role="dialog" aria-modal="true">
          <div className="cmd-panel">
            <div className="cmd-input-row">
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Type a command..."/>
              <button className="btn subtle" onClick={() => setOpen(false)}>Esc</button>
            </div>
            <div className="cmd-list" role="listbox">
              {filtered.length === 0 ? (<div className="cmd-empty">No matches</div>) : (filtered.map(c => (<button key={c.id} className="cmd-item" onClick={() => run(c)}>
                    <div className="cmd-item-main">
                      <div className="cmd-item-title">{c.title}</div>
                      {c.subtitle && <div className="cmd-item-sub">{c.subtitle}</div>}
                    </div>
                    <div className="cmd-item-hint">Enter</div>
                  </button>)))}
            </div>
          </div>
        </div>)}
    </>);
}
//# sourceMappingURL=CommandBar.js.map