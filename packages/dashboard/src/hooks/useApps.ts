import { useEffect, useState, useCallback } from 'react';
import { loadApps, addApp as add, removeApp as remove, type PingAppConfig } from '../lib/api';

/**
 * LocalStorage-backed PingApp registry with in-tab change notifications.
 * This keeps App shell, command bar, and pages in sync.
 */
export function useApps() {
  const [apps, setApps] = useState<PingAppConfig[]>(() => loadApps());

  const refresh = useCallback(() => setApps(loadApps()), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pingdev-apps') refresh();
    };
    const onCustom = () => refresh();

    window.addEventListener('storage', onStorage);
    window.addEventListener('pingdev-apps-changed', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pingdev-apps-changed', onCustom as EventListener);
    };
  }, [refresh]);

  const addApp = useCallback((app: PingAppConfig) => {
    const next = add(app);
    setApps(next);
    return next;
  }, []);

  const removeApp = useCallback((port: number) => {
    const next = remove(port);
    setApps(next);
    return next;
  }, []);

  return { apps, refresh, addApp, removeApp };
}

