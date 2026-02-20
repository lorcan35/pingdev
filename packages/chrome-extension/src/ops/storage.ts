// storage — Browser Storage Access
import type { BridgeResponse } from '../types';

type StorageAction = 'get' | 'set' | 'delete' | 'list';
type StorageStore = 'local' | 'session' | 'cookies';

interface StorageCommand {
  action: StorageAction;
  store: StorageStore;
  key?: string;
  value?: string;
}

export async function handleStorage(command: StorageCommand): Promise<BridgeResponse> {
  const { action, store, key, value } = command;
  if (!action) return { success: false, error: 'Missing action' };
  if (!store) return { success: false, error: 'Missing store (local|session|cookies)' };

  switch (store) {
    case 'local':
      return handleWebStorage(localStorage, action, key, value);
    case 'session':
      return handleWebStorage(sessionStorage, action, key, value);
    case 'cookies':
      return handleCookies(action, key, value);
    default:
      return { success: false, error: `Unknown store: ${store}` };
  }
}

function handleWebStorage(
  storage: Storage,
  action: StorageAction,
  key?: string,
  value?: string,
): BridgeResponse {
  switch (action) {
    case 'get':
      if (!key) return { success: false, error: 'Missing key' };
      return { success: true, data: { key, value: storage.getItem(key) } };

    case 'set':
      if (!key) return { success: false, error: 'Missing key' };
      if (value === undefined) return { success: false, error: 'Missing value' };
      storage.setItem(key, value);
      return { success: true, data: { key, value, set: true } };

    case 'delete':
      if (!key) return { success: false, error: 'Missing key' };
      storage.removeItem(key);
      return { success: true, data: { key, deleted: true } };

    case 'list': {
      const items: Record<string, string> = {};
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) items[k] = storage.getItem(k) || '';
      }
      return { success: true, data: { items, count: storage.length } };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

function handleCookies(
  action: StorageAction,
  key?: string,
  value?: string,
): BridgeResponse {
  switch (action) {
    case 'get': {
      if (!key) return { success: false, error: 'Missing key' };
      const cookies = parseCookies();
      return { success: true, data: { key, value: cookies[key] || null } };
    }

    case 'set': {
      if (!key) return { success: false, error: 'Missing key' };
      if (value === undefined) return { success: false, error: 'Missing value' };
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/`;
      return { success: true, data: { key, value, set: true } };
    }

    case 'delete': {
      if (!key) return { success: false, error: 'Missing key' };
      document.cookie = `${encodeURIComponent(key)}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return { success: true, data: { key, deleted: true } };
    }

    case 'list': {
      const cookies = parseCookies();
      return { success: true, data: { items: cookies, count: Object.keys(cookies).length } };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

function parseCookies(): Record<string, string> {
  const cookies: Record<string, string> = {};
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = decodeURIComponent(trimmed.slice(0, eqIdx));
    const v = decodeURIComponent(trimmed.slice(eqIdx + 1));
    cookies[k] = v;
  }
  return cookies;
}
