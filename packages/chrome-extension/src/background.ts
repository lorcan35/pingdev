// Background service worker - WebSocket client + tab management

import type {
  DeviceRequest,
  DeviceResponse,
  BridgeResponse,
  TabInfo,
  ConnectionStatus,
  ShareTabMessage,
  UnshareTabMessage,
} from './types';

const GATEWAY_URL = 'ws://localhost:3500/ext';
const CLIENT_ID = crypto.randomUUID();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30_000;
let reconnectAttempt = 0;

let heartbeatTimer: number | null = null;
let lastPongAt = 0;

type ConnState = 'connected' | 'connecting' | 'disconnected';
let connState: ConnState = 'disconnected';

interface SharedTabsState {
  [tabId: number]: {
    url: string;
    title: string;
  };
}

interface ManualUnsharedState {
  [tabId: number]: true;
}

interface ExtSharedTab {
  deviceId: string; // e.g. chrome-123
  tabId: number;
  url: string;
  title?: string;
}

// Load shared tabs from storage
async function loadSharedTabs(): Promise<SharedTabsState> {
  const result = await chrome.storage.local.get('sharedTabs');
  return result.sharedTabs || {};
}

// Save shared tabs to storage
async function saveSharedTabs(tabs: SharedTabsState): Promise<void> {
  await chrome.storage.local.set({ sharedTabs: tabs });
}

async function loadManualUnsharedTabs(): Promise<ManualUnsharedState> {
  const result = await chrome.storage.local.get('manualUnsharedTabs');
  return result.manualUnsharedTabs || {};
}

async function saveManualUnsharedTabs(tabs: ManualUnsharedState): Promise<void> {
  await chrome.storage.local.set({ manualUnsharedTabs: tabs });
}

function isShareableUrl(url?: string): boolean {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'));
}

function sharedTabsEqual(a: SharedTabsState, b: SharedTabsState): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const id = Number.parseInt(k, 10);
    if (!Number.isFinite(id)) return false;
    if (!b[id]) return false;
    if (a[id].url !== b[id].url) return false;
    if (a[id].title !== b[id].title) return false;
  }
  return true;
}

function safeCloseSocket(reason: string) {
  if (!ws) return;
  try {
    console.warn('[Background] Closing socket:', reason);
    ws.close();
  } catch (err) {
    console.warn('[Background] socket close failed:', err);
  }
}

function safeSend(message: unknown): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    console.error('[Background] ws.send failed:', err);
    safeCloseSocket('send-failed');
    return false;
  }
}

let helloDebounceTimer: number | null = null;
function scheduleHelloSend() {
  if (helloDebounceTimer) return;
  helloDebounceTimer = setTimeout(() => {
    helloDebounceTimer = null;
    void sendHello();
  }, 200) as unknown as number;
}

async function syncSharedTabsWithAllTabs(opts?: { inject?: boolean; notify?: boolean }): Promise<SharedTabsState> {
  const inject = opts?.inject ?? false;
  const notify = opts?.notify ?? false;

  const [allTabs, manualUnshared, currentShared] = await Promise.all([
    chrome.tabs.query({}),
    loadManualUnsharedTabs(),
    loadSharedTabs(),
  ]);

  const nextShared: SharedTabsState = {};
  for (const tab of allTabs) {
    const tabId = tab.id;
    if (!tabId || !isShareableUrl(tab.url)) continue;
    if (manualUnshared[tabId]) continue;
    nextShared[tabId] = {
      url: tab.url || '',
      title: tab.title || '',
    };
  }

  // Only write if changed (reduces storage churn).
  if (!sharedTabsEqual(currentShared, nextShared)) {
    await saveSharedTabs(nextShared);
    if (notify) scheduleHelloSend();
  }

  if (inject) {
    for (const tabIdStr of Object.keys(nextShared)) {
      const tabId = Number.parseInt(tabIdStr, 10);
      if (!Number.isFinite(tabId)) continue;
      await injectContentScript(tabId);
    }
  }

  return nextShared;
}

// Connect to gateway WebSocket
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('[Background] Already connected/connecting');
    return;
  }

  connState = 'connecting';
  broadcastConnectionStatus();

  try {
    console.log('[Background] Connecting to gateway:', GATEWAY_URL);
    ws = new WebSocket(GATEWAY_URL);
  } catch (err) {
    console.error('[Background] WebSocket constructor failed:', err);
    connState = 'disconnected';
    broadcastConnectionStatus();
    scheduleReconnect();
    return;
  }

  ws.onopen = async () => {
    try {
      console.log('[Background] Connected to gateway');
      connState = 'connected';
      reconnectAttempt = 0;
      lastPongAt = Date.now();
      broadcastConnectionStatus();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      startHeartbeat();

      // Keep shared tabs in sync (default: share all http/https tabs) and ensure
      // content scripts are present after reconnect/gateway restart.
      await syncSharedTabsWithAllTabs({ inject: true });

      // Send hello message with current shared tabs
      await sendHello();
    } catch (err) {
      console.error('[Background] onopen setup failed:', err);
      safeCloseSocket('onopen-failure');
    }
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Background] Received message:', message);

      if (message?.type === 'pong') {
        lastPongAt = Date.now();
        broadcastConnectionStatus();
        return;
      }

      if (message?.type === 'reload_extension') {
        console.log('[Background] Reload requested via gateway');
        chrome.runtime.reload();
        return;
      }

      if (message?.type === 'device_request') {
        await handleDeviceRequest(message as DeviceRequest);
        return;
      }

      // Recording commands from gateway
      if (message?.type === 'record_start' || message?.type === 'record_stop' ||
          message?.type === 'record_export' || message?.type === 'record_status') {
        await handleRecordCommand(message);
        return;
      }
    } catch (err) {
      console.error('[Background] Error handling message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('[Background] WebSocket error:', err);
    // Force reconnect path; onclose will schedule backoff reconnect.
    safeCloseSocket('onerror');
  };

  ws.onclose = () => {
    console.log('[Background] Disconnected from gateway');
    stopHeartbeat();
    connState = 'disconnected';
    broadcastConnectionStatus();
    ws = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(MAX_RECONNECT_DELAY, BASE_RECONNECT_DELAY * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  console.log('[Background] Reconnecting in', delay, 'ms');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay) as unknown as number;
}

function broadcastConnectionStatus() {
  chrome.runtime.sendMessage({
    type: 'connection_status',
    connected: connState === 'connected',
    state: connState,
    gatewayUrl: GATEWAY_URL,
    lastMessageAt: lastPongAt || undefined,
    reconnectAttempt,
  }).catch(() => {
    // Popup may not be open, ignore
  });
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // If we haven't seen a pong recently, force reconnect.
    if (lastPongAt && Date.now() - lastPongAt > 90_000) {
      console.warn('[Background] Heartbeat stale; closing socket');
      try {
        ws.close();
      } catch {
        // ignore
      }
      return;
    }

    const sent = safeSend({ type: 'ping', t: Date.now() });
    if (!sent) {
      console.warn('[Background] Heartbeat send failed; reconnecting');
    }
  }, 30_000) as unknown as number;
}

function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function handleDeviceRequest(request: DeviceRequest) {
  const { device, command, requestId } = request;
  
  // device = "chrome-{tabId}"
  const tabIdMatch = device.match(/^chrome-(\d+)$/);
  if (!tabIdMatch) {
    sendDeviceResponse(requestId, {
      success: false,
      error: 'Invalid device format',
    });
    return;
  }

  const tabId = parseInt(tabIdMatch[1], 10);
  const sharedTabs = await loadSharedTabs();

  if (!sharedTabs[tabId]) {
    sendDeviceResponse(requestId, {
      success: false,
      error: 'Tab not shared',
    });
    return;
  }

  // Special handling for 'navigate' — use chrome.tabs.update to bypass content script
  // This ensures navigation works even when the content script is orphaned/stale.
  if (command.type === 'navigate') {
    try {
      const url = command.url;
      if (!url) {
        sendDeviceResponse(requestId, { success: false, error: 'No URL provided' });
        return;
      }
      await chrome.tabs.update(tabId, { url });
      // Wait for page load, then inject content script
      const waitForLoad = () => new Promise<void>((resolve) => {
        const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        // Timeout after 15s
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }, 15000);
      });
      await waitForLoad();
      await injectContentScript(tabId);
      sendDeviceResponse(requestId, { success: true });
      return;
    } catch (err) {
      sendDeviceResponse(requestId, {
        success: false,
        error: err instanceof Error ? err.message : 'Navigate failed',
      });
      return;
    }
  }

  // Special handling for 'eval' — use chrome.debugger CDP to bypass CSP completely
  if (command.type === 'eval') {
    try {
      // CANONICAL field name is `expression`; keep `code` as a fallback alias.
      const code = command.expression || command.code;
      if (!code) {
        sendDeviceResponse(requestId, { success: false, error: 'No code/expression provided' });
        return;
      }

      // Attach debugger
      await chrome.debugger.attach({ tabId }, '1.3');

      try {
        // Evaluate via CDP Runtime.evaluate
        const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: code,
          returnByValue: true,
          awaitPromise: true,
        }) as Record<string, any>;

        // Detach debugger
        await chrome.debugger.detach({ tabId });

        if (result.exceptionDetails) {
          sendDeviceResponse(requestId, {
            success: false,
            error: result.exceptionDetails.exception?.description || 'Eval exception',
          });
        } else {
          sendDeviceResponse(requestId, {
            success: true,
            data: result.result.value,
          });
        }
        return;
      } catch (debugErr) {
        // Detach on error
        await chrome.debugger.detach({ tabId }).catch(() => {});
        throw debugErr;
      }
    } catch (err) {
      sendDeviceResponse(requestId, {
        success: false,
        error: err instanceof Error ? err.message : 'Eval failed',
      });
      return;
    }
  }

  // Special handling for 'click' with cdp:true — use CDP mouse events
  if (command.type === 'click' && (command as any).cdp && command.x !== undefined && command.y !== undefined) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      try {
        const x = command.x;
        const y = command.y;
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1,
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
        });
        await chrome.debugger.detach({ tabId });
        sendDeviceResponse(requestId, { success: true, data: { clickedAt: { x, y } } });
        return;
      } catch (debugErr) {
        await chrome.debugger.detach({ tabId }).catch(() => {});
        throw debugErr;
      }
    } catch (err) {
      sendDeviceResponse(requestId, {
        success: false,
        error: err instanceof Error ? err.message : 'CDP click failed',
      });
      return;
    }
  }

  // Special handling for 'press' with cdp:true — use Chrome DevTools Protocol
  // to dispatch TRUSTED keyboard events (isTrusted: true) that canvas apps accept
  if (command.type === 'press' && (command as any).cdp) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      try {
        const key = command.key;
        const mods = new Set(((command as any).modifiers ?? []).map((m: string) => m.toLowerCase()));
        const modifiers = (mods.has('alt') ? 1 : 0) | (mods.has('ctrl') || mods.has('control') ? 2 : 0) |
          (mods.has('meta') || mods.has('cmd') || mods.has('command') ? 4 : 0) | (mods.has('shift') ? 8 : 0);

        // Map key name to CDP keyIdentifier and codes
        const text = key.length === 1 ? key : '';
        const unmodifiedText = text;

        // keyDown
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          text,
          unmodifiedText,
          modifiers,
          ...(key.length === 1 ? { } : { }),
        });

        // char event for printable keys
        if (text) {
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'char',
            key,
            text,
            unmodifiedText,
            modifiers,
          });
        }

        // keyUp
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          text: '',
          unmodifiedText: '',
          modifiers,
        });

        await chrome.debugger.detach({ tabId });
        sendDeviceResponse(requestId, { success: true });
        return;
      } catch (debugErr) {
        await chrome.debugger.detach({ tabId }).catch(() => {});
        throw debugErr;
      }
    } catch (err) {
      sendDeviceResponse(requestId, {
        success: false,
        error: err instanceof Error ? err.message : 'CDP press failed',
      });
      return;
    }
  }

  // Special handling for 'type' with cdp:true — type a string via trusted CDP events
  if (command.type === 'type' && (command as any).cdp) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      try {
        const text = (command as any).text || '';
        // Use Input.insertText to avoid the character doubling bug.
        // rawKeyDown + keyUp dispatches both the key event AND triggers the
        // browser's built-in text insertion, resulting in double characters.
        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text });
        await chrome.debugger.detach({ tabId });
        sendDeviceResponse(requestId, { success: true });
        return;
      } catch (debugErr) {
        await chrome.debugger.detach({ tabId }).catch(() => {});
        throw debugErr;
      }
    } catch (err) {
      sendDeviceResponse(requestId, {
        success: false,
        error: err instanceof Error ? err.message : 'CDP type failed',
      });
      return;
    }
  }

  // Forward other commands to content script
  try {
    let response = await chrome.tabs.sendMessage(tabId, {
      type: 'bridge_command',
      command,
    }).catch(() => null);

    // If response is null, content script may be orphaned — re-inject and retry once
    if (!response) {
      await injectContentScript(tabId);
      await new Promise(r => setTimeout(r, 300));
      response = await chrome.tabs.sendMessage(tabId, {
        type: 'bridge_command',
        command,
      }).catch(() => null);
    }

    sendDeviceResponse(requestId, response ?? { success: false, error: 'Content script not responding' });
  } catch (err) {
    sendDeviceResponse(requestId, {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

async function handleRecordCommand(message: any) {
  const device = message.device || '';
  const requestId = message.requestId || '';
  const tabIdMatch = device.match(/^chrome-(\d+)$/);

  if (!tabIdMatch) {
    sendDeviceResponse(requestId, { success: false, error: 'Invalid device format' });
    return;
  }

  const tabId = parseInt(tabIdMatch[1], 10);
  // Map gateway message type to content script command type
  const typeMap: Record<string, string> = {
    record_start: 'record_start',
    record_stop: 'record_stop',
    record_export: 'record_export',
    record_status: 'record_status',
  };
  const commandType = typeMap[message.type];

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'bridge_command',
      command: { type: commandType, name: message.name },
    });
    sendDeviceResponse(requestId, response);
  } catch (err) {
    sendDeviceResponse(requestId, {
      success: false,
      error: err instanceof Error ? err.message : 'Record command failed',
    });
  }
}

function sendDeviceResponse(requestId: string, response: BridgeResponse) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[Background] Cannot send response, not connected');
    return;
  }

  const message = {
    type: 'device_response',
    id: requestId,
    ok: response.success,
    result: response.data,
    error: response.error,
  };

  safeSend(message);
}

async function sendHello() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const sharedTabs = await loadSharedTabs();
  const tabs: ExtSharedTab[] = Object.entries(sharedTabs).map(([tabIdStr, info]) => ({
    deviceId: `chrome-${tabIdStr}`,
    tabId: parseInt(tabIdStr, 10),
    url: info.url,
    title: info.title,
  }));
  
  const message = {
    type: 'hello',
    clientId: CLIENT_ID,
    version: '0.1.0',
    tabs,
  };
  
  if (safeSend(message)) {
    console.log('[Background] Sent hello with', tabs.length, 'shared tabs');
  }
}

async function sendShareUpdate() {
  // Backwards-compatible helper: the gateway understands both `hello` and
  // `share_update`. Per current contract, we keep everything on `hello`.
  await sendHello();
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_connection_status') {
    const status: ConnectionStatus = {
      connected: connState === 'connected',
      state: connState,
      gatewayUrl: GATEWAY_URL,
      lastMessageAt: lastPongAt || undefined,
      reconnectAttempt,
    };
    sendResponse(status);
    return true;
  }

  if (message.type === 'share_tab') {
    const msg = message as ShareTabMessage;
    handleShareTab(msg.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'unshare_tab') {
    const msg = message as UnshareTabMessage;
    handleUnshareTab(msg.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'get_shared_tabs') {
    loadSharedTabs().then((tabs) => {
      sendResponse(tabs);
    });
    return true;
  }

  // CDP key dispatch — content scripts use this for trusted keyboard events
  // that canvas apps (Google Sheets) require (isTrusted: true).
  if (message.type === 'cdp_keys') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return true;
    }
    (async () => {
      try {
        await chrome.debugger.attach({ tabId }, '1.3');
        try {
          for (const step of message.steps as Array<{ action: string; text?: string; key?: string; modifiers?: number; x?: number; y?: number }>) {
            if (step.action === 'insertText' && step.text) {
              await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: step.text });
            } else if (step.action === 'keyDown' && step.key) {
              const text = step.key.length === 1 ? step.key : '';
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyDown', key: step.key, text, unmodifiedText: text, modifiers: step.modifiers ?? 0,
              });
            } else if (step.action === 'keyUp' && step.key) {
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyUp', key: step.key, text: '', unmodifiedText: '', modifiers: step.modifiers ?? 0,
              });
            } else if (step.action === 'char' && step.key) {
              const text = step.key.length === 1 ? step.key : '';
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
                type: 'char', key: step.key, text, unmodifiedText: text, modifiers: step.modifiers ?? 0,
              });
            } else if (step.action === 'mouseClick' && step.x !== undefined && step.y !== undefined) {
              const x = step.x as number;
              const y = step.y as number;
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
                type: 'mousePressed', x, y, button: 'left', clickCount: 1,
              });
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
              });
            } else if (step.action === 'pause') {
              await new Promise(r => setTimeout(r, 50));
            }
          }
          await chrome.debugger.detach({ tabId });
          sendResponse({ success: true });
        } catch (e) {
          await chrome.debugger.detach({ tabId }).catch(() => {});
          throw e;
        }
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : 'CDP keys failed' });
      }
    })();
    return true;
  }

  return false;
});

async function handleShareTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId);

  // Manual override: sharing a tab clears any previous manual-unshare override.
  const manualUnshared = await loadManualUnsharedTabs();
  if (manualUnshared[tabId]) {
    delete manualUnshared[tabId];
    await saveManualUnsharedTabs(manualUnshared);
  }

  const sharedTabs = await loadSharedTabs();
  if (!isShareableUrl(tab.url)) {
    delete sharedTabs[tabId];
    await saveSharedTabs(sharedTabs);
    scheduleHelloSend();
    console.log('[Background] Share skipped (non-http/https url) tab:', tabId);
    return;
  }

  sharedTabs[tabId] = { url: tab.url || '', title: tab.title || '' };
  await saveSharedTabs(sharedTabs);
  // Anti-fingerprint: inject early overrides into the page world.
  await injectAntiFingerprint(tabId);
  await injectContentScript(tabId);
  scheduleHelloSend();
  console.log('[Background] Shared tab:', tabId);
}

async function handleUnshareTab(tabId: number) {
  const [sharedTabs, manualUnshared] = await Promise.all([loadSharedTabs(), loadManualUnsharedTabs()]);
  delete sharedTabs[tabId];
  manualUnshared[tabId] = true;
  await Promise.all([saveSharedTabs(sharedTabs), saveManualUnsharedTabs(manualUnshared)]);
  scheduleHelloSend();
  console.log('[Background] Unshared tab:', tabId);
}

// Tab cleanup - remove closed tabs from shared list
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const [sharedTabs, manualUnshared] = await Promise.all([loadSharedTabs(), loadManualUnsharedTabs()]);
  const hadShared = !!sharedTabs[tabId];
  const hadOverride = !!manualUnshared[tabId];
  if (hadShared) delete sharedTabs[tabId];
  if (hadOverride) delete manualUnshared[tabId];

  if (hadShared || hadOverride) {
    await Promise.all([saveSharedTabs(sharedTabs), saveManualUnsharedTabs(manualUnshared)]);
    scheduleHelloSend();
    console.log('[Background] Removed closed tab from state:', tabId);
  }
});

// Initialize on startup
console.log('[Background] Service worker started');

chrome.runtime.onStartup?.addListener(() => {
  void syncSharedTabsWithAllTabs({ inject: true, notify: true });
  connect();
});

chrome.runtime.onInstalled?.addListener(() => {
  void syncSharedTabsWithAllTabs({ inject: true, notify: true });
  connect();
});

// Auto-share all http/https tabs by default.
chrome.tabs.onCreated.addListener((tab) => {
  const tabId = tab.id;
  if (!tabId) return;
  if (!isShareableUrl(tab.url)) return;
  void (async () => {
    const manualUnshared = await loadManualUnsharedTabs();
    if (manualUnshared[tabId]) return;
    const shared = await loadSharedTabs();
    shared[tabId] = { url: tab.url || '', title: tab.title || '' };
    await saveSharedTabs(shared);
    scheduleHelloSend();
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Wait for URL/title changes or navigation completion.
  if (!changeInfo.url && changeInfo.status !== 'complete' && changeInfo.status !== 'loading') return;

  void (async () => {
    const [manualUnshared, shared] = await Promise.all([loadManualUnsharedTabs(), loadSharedTabs()]);

    // If tab is not shareable (chrome://, extension pages, etc), ensure it's not shared.
    if (!isShareableUrl(tab.url)) {
      if (shared[tabId]) {
        delete shared[tabId];
        await saveSharedTabs(shared);
        scheduleHelloSend();
      }
      return;
    }

    if (manualUnshared[tabId]) return;

    const nextInfo = { url: tab.url || '', title: tab.title || '' };
    const prevInfo = shared[tabId];
    const changed = !prevInfo || prevInfo.url !== nextInfo.url || prevInfo.title !== nextInfo.title;
    if (changed) {
      shared[tabId] = nextInfo;
      await saveSharedTabs(shared);
      scheduleHelloSend();
    }

    if (changeInfo.status === 'loading') {
      await injectAntiFingerprint(tabId);
      return;
    }

    if (changeInfo.status === 'complete') {
      await injectContentScript(tabId);
    }
  })();
});

async function injectAntiFingerprint(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      injectImmediately: true,
      func: () => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        } catch {
          // ignore
        }

        try {
          // Override plugins to look realistic
          Object.defineProperty(navigator, 'plugins', {
            get: () => ({ length: 5, 0: { name: 'Chrome PDF Plugin' } }),
          });
        } catch {
          // ignore
        }
      },
    });
  } catch (err) {
    console.debug('[Background] injectAntiFingerprint skipped/failed', tabId, err);
  }
}

async function injectContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    });
    console.log('[Background] Injected content script into tab', tabId);
  } catch (err) {
    // Often fails if already injected; ignore.
    console.debug('[Background] injectContentScript skipped/failed', tabId, err);
  }
}

async function ensureSharedTabsInjected() {
  // Legacy helper kept for compatibility; now we default-share all http/https
  // tabs and inject into them.
  await syncSharedTabsWithAllTabs({ inject: true, notify: true });
}

// Start immediately (service worker may be launched by events; this covers cold start)
void syncSharedTabsWithAllTabs({ inject: true, notify: true });
connect();
