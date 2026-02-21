import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
export interface ExtSharedTab {
    deviceId: string;
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
    requestId: string;
    device: string;
    command: unknown;
}
export interface ExtDeviceResponse {
    type: 'device_response';
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
export declare class ExtensionBridge {
    private wss;
    private clients;
    private deviceOwners;
    private sharedTabs;
    private pending;
    private clientLastSeen;
    /** Hook into Node's HTTP upgrade flow and accept connections for /ext. */
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
    start(): void;
    stop(): void;
    ownsDevice(deviceId: string): boolean;
    getOwner(deviceId: string): string | undefined;
    getDeviceStatus(deviceId: string): {
        owned: boolean;
        clientId?: string;
        wsState?: number;
        lastSeen?: number;
    };
    listSharedTabs(): Array<{
        clientId: string;
        tabs: ExtSharedTab[];
    }>;
    callDevice(params: {
        deviceId: string;
        op: string;
        payload: unknown;
        timeoutMs?: number;
    }): Promise<unknown>;
    /** Send a raw message to the first connected extension client. */
    sendToFirstClient(message: unknown): boolean;
    private onConnection;
    private updateShares;
    private cleanupClient;
}
//# sourceMappingURL=ext-bridge.d.ts.map