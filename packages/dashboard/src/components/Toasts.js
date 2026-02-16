import { createContext, useContext, useMemo, useState } from 'react';
const Ctx = createContext(null);
function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const toast = (t) => {
        const id = uid();
        const item = { id, intent: t.intent, title: t.title, message: t.message };
        setToasts(prev => [...prev, item].slice(-4));
        const ttl = t.ttlMs ?? 4500;
        window.setTimeout(() => {
            setToasts(prev => prev.filter(x => x.id !== id));
        }, ttl);
    };
    const value = useMemo(() => ({ toast }), []);
    return (<Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions removals">
        {toasts.map(t => (<div key={t.id} className={`toast t-${t.intent}`} role="status">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>))}
      </div>
    </Ctx.Provider>);
}
export function useToast() {
    const v = useContext(Ctx);
    if (!v)
        throw new Error('useToast must be used within ToastProvider');
    return v;
}
//# sourceMappingURL=Toasts.js.map