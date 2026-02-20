// network — Intercept Network Calls
import type { BridgeResponse } from '../types';

type NetworkAction = 'start' | 'stop' | 'list';

interface NetworkCommand {
  action: NetworkAction;
  filter?: { url?: string; method?: string };
}

interface CapturedRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseType?: string;
  bodyPreview?: string;
  timestamp: number;
}

// Module-level state for network capture
let networkCapturing = false;
const capturedRequests: CapturedRequest[] = [];
let origFetch: typeof fetch | null = null;
let origXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let origXHRSend: typeof XMLHttpRequest.prototype.send | null = null;
let networkFilter: { url?: string; method?: string } = {};

export async function handleNetwork(command: NetworkCommand): Promise<BridgeResponse> {
  const { action, filter } = command;
  if (!action) return { success: false, error: 'Missing action' };

  switch (action) {
    case 'start':
      return startCapture(filter);
    case 'stop':
      return stopCapture();
    case 'list':
      return listCaptured(filter);
    default:
      return { success: false, error: `Unknown network action: ${action}` };
  }
}

function startCapture(filter?: { url?: string; method?: string }): BridgeResponse {
  if (networkCapturing) {
    return { success: true, data: { capturing: true, message: 'Already capturing' } };
  }

  networkCapturing = true;
  networkFilter = filter || {};
  capturedRequests.length = 0;

  // Intercept fetch
  origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = init?.method || 'GET';

    if (matchesFilter(url, method)) {
      const entry: CapturedRequest = {
        url,
        method: method.toUpperCase(),
        timestamp: Date.now(),
      };

      return origFetch!.call(this, input, init).then(async (response) => {
        entry.status = response.status;
        entry.statusText = response.statusText;
        entry.responseType = response.headers.get('content-type') || '';
        capturedRequests.push(entry);
        return response;
      }).catch((err) => {
        entry.status = 0;
        entry.statusText = err.message;
        capturedRequests.push(entry);
        throw err;
      });
    }

    return origFetch!.call(this, input, init);
  };

  // Intercept XHR
  origXHROpen = XMLHttpRequest.prototype.open;
  origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any)._pingUrl = typeof url === 'string' ? url : url.toString();
    (this as any)._pingMethod = method;
    return origXHROpen!.apply(this, [method, url, ...rest] as any);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const url = (this as any)._pingUrl || '';
    const method = (this as any)._pingMethod || 'GET';

    if (matchesFilter(url, method)) {
      const entry: CapturedRequest = {
        url,
        method: method.toUpperCase(),
        timestamp: Date.now(),
      };

      this.addEventListener('loadend', () => {
        entry.status = this.status;
        entry.statusText = this.statusText;
        entry.responseType = this.getResponseHeader('content-type') || '';
        try {
          const text = this.responseText;
          entry.bodyPreview = text.length > 500 ? text.slice(0, 500) + '...' : text;
        } catch { /* response might not be text */ }
        capturedRequests.push(entry);
      }, { once: true });
    }

    return origXHRSend!.apply(this, [body]);
  };

  return { success: true, data: { capturing: true, filter: networkFilter } };
}

function stopCapture(): BridgeResponse {
  if (!networkCapturing) {
    return { success: true, data: { capturing: false, message: 'Not capturing' } };
  }

  if (origFetch) window.fetch = origFetch;
  if (origXHROpen) XMLHttpRequest.prototype.open = origXHROpen;
  if (origXHRSend) XMLHttpRequest.prototype.send = origXHRSend;
  origFetch = null;
  origXHROpen = null;
  origXHRSend = null;
  networkCapturing = false;

  const count = capturedRequests.length;
  return { success: true, data: { capturing: false, requestCount: count } };
}

function listCaptured(filter?: { url?: string; method?: string }): BridgeResponse {
  let results = [...capturedRequests];
  if (filter) {
    results = results.filter(r => matchesFilter(r.url, r.method, filter));
  }
  return {
    success: true,
    data: { capturing: networkCapturing, requests: results, count: results.length },
  };
}

function matchesFilter(url: string, method: string, filter?: { url?: string; method?: string }): boolean {
  const f = filter || networkFilter;
  if (f.url && !url.includes(f.url)) return false;
  if (f.method && method.toUpperCase() !== f.method.toUpperCase()) return false;
  return true;
}
