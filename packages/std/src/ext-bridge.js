// @pingdev/std — Chrome Extension Auth Bridge (Gateway-side)
// Manages WebSocket connections from the PingOS Chrome extension and forwards
// HTTP /v1/dev/:device/:op calls to the owning extension client.

import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ENODEV, ETIMEDOUT, EIO } from './errors.js';
import { logGateway, serializeError } from './gw-log.js';

export class ExtensionBridge {
  wss = new WebSocketServer({ noServer: true });
  clients = new Map();
  deviceOwners = new Map(); // deviceId -> clientId
  sharedTabs = new Map(); // clientId -> tabs
  pending = new Map(); // requestId -> {resolve,reject,timer,startedAt}
  clientLastSeen = new Map(); // clientId -> epoch ms

  /** Hook into Node's HTTP upgrade flow and accept connections for /ext. */
  handleUpgrade(req, socket, head) {
    const url = req.url ?? '';
    if (!url.startsWith('/ext')) return false;

    // IMPORTANT: unhandled socket 'error' events can crash Node.
    socket.on('error', (err) => {
      logGateway('[ext] upgrade socket error', serializeError(err));
    });

    try {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    } catch (err) {
      logGateway('[ext] handleUpgrade threw', serializeError(err));
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      return true;
    }

    return true;
  }

  start() {
    // IMPORTANT: unhandled 'error' events can crash Node.
    this.wss.on('error', (err) => {
      logGateway('[ext] wss error', serializeError(err));
    });

    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  stop() {
    for (const [id, ws] of this.clients) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      this.cleanupClient(id);
    }
    this.wss.close();
  }

  ownsDevice(deviceId) {
    return this.deviceOwners.has(deviceId);
  }

  getOwner(deviceId) {
    return this.deviceOwners.get(deviceId);
  }

  listSharedTabs() {
    return Array.from(this.sharedTabs.entries()).map(([clientId, tabs]) => ({ clientId, tabs }));
  }

  getDeviceStatus(deviceId) {
    const clientId = this.deviceOwners.get(deviceId);
    if (!clientId) return { owned: false };
    const ws = this.clients.get(clientId);
    return {
      owned: true,
      clientId,
      wsState: ws?.readyState,
      lastSeen: this.clientLastSeen.get(clientId),
    };
  }

  async callDevice(params) {
    const owner = this.deviceOwners.get(params.deviceId);
    if (!owner) throw ENODEV(params.deviceId);

    const ws = this.clients.get(owner);
    if (!ws) throw ENODEV(params.deviceId);

    const requestId = randomUUID();

    // The content script expects the command shape:
    //   { type: 'read'|'click'|'type'|..., ...payload }
    // so we synthesize that from (op, payload).
    const payloadObj =
      params.payload && typeof params.payload === 'object' ? params.payload : undefined;
    const command = payloadObj ? { type: params.op, ...payloadObj } : { type: params.op, payload: params.payload };

    const msg = {
      type: 'device_request',
      requestId,
      device: params.deviceId,
      command,
    };

    const timeoutMs = params.timeoutMs ?? 20_000;

    return new Promise((resolve, reject) => {
      const startedAt = process.hrtime.bigint();

      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        logGateway('[ext] device_request timeout', {
          id: requestId,
          deviceId: params.deviceId,
          op: params.op,
          timeoutMs,
        });
        reject(ETIMEDOUT('extension', timeoutMs));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer, startedAt });

      try {
        logGateway('[ext] send device_request', {
          id: requestId,
          deviceId: params.deviceId,
          op: params.op,
          commandType: command?.type,
        });
        ws.send(JSON.stringify(msg), (err) => {
          if (!err) return;
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(EIO('extension', err.message));
        });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(EIO('extension', e instanceof Error ? e.message : e));
      }
    });
  }

  // ---- internals ----

  onConnection(ws) {
    let clientId = null;

    logGateway('[ext] connection');

    // IMPORTANT: unhandled ws 'error' events can crash Node.
    ws.on('error', (err) => {
      logGateway('[ext] ws error', serializeError(err));
    });

    ws.on('message', (buf) => {
      try {
        const text = typeof buf === 'string' ? buf : buf.toString('utf-8');
        const msg = JSON.parse(text);

        logGateway('[ext] inbound', { type: msg?.type });

        if (msg.type === 'hello') {
          clientId = msg.clientId;
          this.clients.set(msg.clientId, ws);
          this.clientLastSeen.set(msg.clientId, Date.now());
          logGateway('[ext] hello', {
            clientId: msg.clientId,
            version: msg.version,
            tabs: msg.tabs?.length ?? 0,
          });
          this.updateShares(msg.clientId, msg.tabs);
          return;
        }

        if (msg.type === 'share_update') {
          this.clientLastSeen.set(msg.clientId, Date.now());
          logGateway('[ext] share_update', { clientId: msg.clientId, tabs: msg.tabs?.length ?? 0 });
          this.updateShares(msg.clientId, msg.tabs);
          return;
        }

        if (msg.type === 'device_response') {
          const pending = this.pending.get(msg.id);
          if (!pending) {
            logGateway('[ext] device_response without pending', { id: msg.id, ok: msg.ok });
            return;
          }

          if (clientId) this.clientLastSeen.set(clientId, Date.now());

          clearTimeout(pending.timer);
          this.pending.delete(msg.id);

          const durationMs = Number(process.hrtime.bigint() - pending.startedAt) / 1e6;
          logGateway('[ext] device_response', { id: msg.id, ok: msg.ok, durationMs });

          if (msg.ok) pending.resolve(msg.result);
          else pending.reject(EIO('extension', msg.error ?? 'unknown error'));
          return;
        }

        if (msg.type === 'ping') {
          if (clientId) this.clientLastSeen.set(clientId, Date.now());
          try {
            ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
          } catch {
            // ignore
          }
          return;
        }
      } catch (err) {
        logGateway('[ext] message handler error', serializeError(err));
      }
    });

    ws.on('close', () => {
      if (!clientId) return;
      logGateway('[ext] close', { clientId });
      this.cleanupClient(clientId);
    });
  }

  updateShares(clientId, tabs) {
    logGateway('[ext] updateShares', {
      clientId,
      tabs: tabs?.length ?? 0,
      sample: (tabs ?? []).slice(0, 5).map((t) => ({ deviceId: t.deviceId, tabId: t.tabId, url: t.url })),
    });

    // Clear old owners for this client.
    for (const [deviceId, owner] of this.deviceOwners.entries()) {
      if (owner === clientId) this.deviceOwners.delete(deviceId);
    }

    this.sharedTabs.set(clientId, tabs);
    for (const tab of tabs ?? []) {
      this.deviceOwners.set(tab.deviceId, clientId);
    }
  }

  cleanupClient(clientId) {
    logGateway('[ext] cleanupClient', { clientId });
    this.clients.delete(clientId);
    this.sharedTabs.delete(clientId);
    this.clientLastSeen.delete(clientId);

    for (const [deviceId, owner] of this.deviceOwners.entries()) {
      if (owner === clientId) this.deviceOwners.delete(deviceId);
    }
  }
}
