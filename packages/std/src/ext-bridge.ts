// @pingdev/std — Chrome Extension Auth Bridge (Gateway-side)
// Manages WebSocket connections from the PingOS Chrome extension and forwards
// HTTP /v1/dev/:device/:op calls to the owning extension client.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { ENODEV, ETIMEDOUT, EIO } from './errors.js';
import type { PingError } from './types.js';
import { logGateway, serializeError } from './gw-log.js';

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

export interface ExtSharedTab {
  deviceId: string; // e.g. tab-123
  tabId: number;
  url: string;
  title?: string;
}

export interface ExtHello {
  type: 'hello';
  clientId: string;
  version: string;
  tabs: ExtSharedTab[];
}

export interface ExtShareUpdate {
  type: 'share_update';
  clientId: string;
  tabs: ExtSharedTab[];
}

export interface ExtDeviceRequest {
  type: 'device_request';
  // NOTE: This matches the currently shipped extension background.js protocol:
  // it expects { device, command, requestId }.
  requestId: string;
  device: string;
  command: unknown;
}

export interface ExtDeviceResponse {
  type: 'device_response';
  // requestId echoed back as `id` by the extension.
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ExtPing {
  type: 'ping';
  t?: number;
}

export interface ExtPong {
  type: 'pong';
  t?: number;
}

type ExtInbound = ExtHello | ExtShareUpdate | ExtDeviceResponse | ExtPing;

// ---------------------------------------------------------------------------
// Bridge implementation
// ---------------------------------------------------------------------------

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: PingError) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: bigint;
}

export class ExtensionBridge {
  private wss = new WebSocketServer({ noServer: true });
  private clients = new Map<string, WebSocket>();
  private deviceOwners = new Map<string, string>(); // deviceId -> clientId
  private sharedTabs = new Map<string, ExtSharedTab[]>(); // clientId -> tabs
  private pending = new Map<string, PendingCall>(); // requestId -> promise handlers
  private clientLastSeen = new Map<string, number>(); // clientId -> epoch ms

  /** Hook into Node's HTTP upgrade flow and accept connections for /ext. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
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

  start(): void {
    // IMPORTANT: unhandled 'error' events can crash Node.
    this.wss.on('error', (err) => {
      logGateway('[ext] wss error', serializeError(err));
    });

    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  stop(): void {
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

  ownsDevice(deviceId: string): boolean {
    return this.deviceOwners.has(deviceId);
  }

  getOwner(deviceId: string): string | undefined {
    return this.deviceOwners.get(deviceId);
  }

  getDeviceStatus(deviceId: string): {
    owned: boolean;
    clientId?: string;
    wsState?: number;
    lastSeen?: number;
  } {
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

  listSharedTabs(): Array<{ clientId: string; tabs: ExtSharedTab[] }> {
    return Array.from(this.sharedTabs.entries()).map(([clientId, tabs]) => ({ clientId, tabs }));
  }

  async callDevice(params: {
    deviceId: string;
    op: string;
    payload: unknown;
    timeoutMs?: number;
  }): Promise<unknown> {
    const owner = this.deviceOwners.get(params.deviceId);
    if (!owner) throw ENODEV(params.deviceId);

    const ws = this.clients.get(owner);
    if (!ws) throw ENODEV(params.deviceId);

    const requestId = randomUUID();

    // The content script expects the command shape:
    //   { type: 'read'|'click'|'type'|..., ...payload }
    // so we synthesize that from (op, payload).
    const payloadObj =
      params.payload && typeof params.payload === 'object' ? (params.payload as Record<string, unknown>) : undefined;
    const command = payloadObj ? { type: params.op, ...payloadObj } : { type: params.op, payload: params.payload };

    const msg: ExtDeviceRequest = {
      type: 'device_request',
      requestId,
      device: params.deviceId,
      command,
    };

    const timeoutMs = params.timeoutMs ?? 20_000;

    return new Promise<unknown>((resolve, reject) => {
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
          commandType: (command as { type?: string })?.type,
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

  /** Send a raw message to the first connected extension client. */
  sendToFirstClient(message: unknown): boolean {
    const first = this.clients.entries().next();
    if (first.done) return false;
    const [, ws] = first.value;
    if (ws.readyState !== 1 /* OPEN */) return false;
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  // ---- internals ----

  private onConnection(ws: WebSocket): void {
    let clientId: string | null = null;

    logGateway('[ext] connection');

    // IMPORTANT: unhandled ws 'error' events can crash Node.
    ws.on('error', (err) => {
      logGateway('[ext] ws error', serializeError(err));
    });

    ws.on('message', (buf) => {
      try {
        const text = typeof buf === 'string' ? buf : buf.toString('utf-8');
        const msg = JSON.parse(text) as ExtInbound;

        logGateway('[ext] inbound', { type: (msg as { type?: string }).type });

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
            const pong: ExtPong = { type: 'pong', t: msg.t };
            ws.send(JSON.stringify(pong));
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

  private updateShares(clientId: string, tabs: ExtSharedTab[]) {
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
    for (const tab of tabs) {
      this.deviceOwners.set(tab.deviceId, clientId);
    }
  }

  private cleanupClient(clientId: string) {
    logGateway('[ext] cleanupClient', { clientId });
    this.clients.delete(clientId);
    this.sharedTabs.delete(clientId);
    this.clientLastSeen.delete(clientId);
    for (const [deviceId, owner] of this.deviceOwners.entries()) {
      if (owner === clientId) this.deviceOwners.delete(deviceId);
    }
  }
}
