// @pingdev/std — Extension bridge integration tests
// Tests WebSocket communication and device routing
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createGateway } from '../gateway.js';
import { ModelRegistry } from '../registry.js';
import { ExtensionBridge } from '../ext-bridge.js';
const PORT = 3581; // Avoid conflicts with other tests
const WS_URL = `ws://localhost:${PORT}/ext`;
const HTTP_BASE = `http://localhost:${PORT}`;
let app;
let extBridge;
beforeAll(async () => {
    const registry = new ModelRegistry('best');
    extBridge = new ExtensionBridge();
    app = await createGateway({ port: PORT, registry, extBridge });
});
afterAll(async () => {
    if (extBridge)
        extBridge.stop();
    if (app)
        await app.close();
});
// ---------------------------------------------------------------------------
// WebSocket connection + hello
// ---------------------------------------------------------------------------
describe('WebSocket connection', () => {
    it('accepts /ext WebSocket upgrade and processes hello message', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
        });
        const hello = {
            type: 'hello',
            clientId: 'test-client-1',
            version: '0.1.0',
            tabs: [
                { deviceId: 'tab-100', tabId: 100, url: 'https://example.com', title: 'Example' },
            ],
        };
        ws.send(JSON.stringify(hello));
        // Give the bridge time to process
        await new Promise((r) => setTimeout(r, 50));
        expect(extBridge.ownsDevice('tab-100')).toBe(true);
        expect(extBridge.getOwner('tab-100')).toBe('test-client-1');
        ws.close();
    });
});
// ---------------------------------------------------------------------------
// Share update
// ---------------------------------------------------------------------------
describe('Share update', () => {
    it('updates owned devices when share_update is sent', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        const hello = {
            type: 'hello',
            clientId: 'test-client-2',
            version: '0.1.0',
            tabs: [{ deviceId: 'tab-200', tabId: 200, url: 'https://a.com' }],
        };
        ws.send(JSON.stringify(hello));
        await new Promise((r) => setTimeout(r, 50));
        expect(extBridge.ownsDevice('tab-200')).toBe(true);
        const update = {
            type: 'share_update',
            clientId: 'test-client-2',
            tabs: [
                { deviceId: 'tab-201', tabId: 201, url: 'https://b.com' },
                { deviceId: 'tab-202', tabId: 202, url: 'https://c.com' },
            ],
        };
        ws.send(JSON.stringify(update));
        await new Promise((r) => setTimeout(r, 50));
        expect(extBridge.ownsDevice('tab-200')).toBe(false);
        expect(extBridge.ownsDevice('tab-201')).toBe(true);
        expect(extBridge.ownsDevice('tab-202')).toBe(true);
        ws.close();
    });
});
// ---------------------------------------------------------------------------
// Device request/response flow
// ---------------------------------------------------------------------------
describe('Device request/response via HTTP → WS → extension', () => {
    it('forwards HTTP POST /v1/dev/:device/:op to extension and returns result', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        // Register a shared tab
        const hello = {
            type: 'hello',
            clientId: 'test-client-3',
            version: '0.1.0',
            tabs: [{ deviceId: 'tab-300', tabId: 300, url: 'https://test.com' }],
        };
        ws.send(JSON.stringify(hello));
        await new Promise((r) => setTimeout(r, 50));
        // Mock extension responding to device_request
        ws.on('message', (buf) => {
            const msg = JSON.parse(buf.toString('utf-8'));
            if (msg.type === 'device_request') {
                const resp = {
                    type: 'device_response',
                    id: msg.requestId,
                    ok: true,
                    result: { clicked: true, selector: msg.command.selector },
                };
                ws.send(JSON.stringify(resp));
            }
        });
        // Send HTTP request to the gateway
        const res = await fetch(`${HTTP_BASE}/v1/dev/tab-300/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selector: '#btn' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json());
        expect(body.ok).toBe(true);
        expect(body.result.clicked).toBe(true);
        expect(body.result.selector).toBe('#btn');
        ws.close();
    }, 10_000);
    it('returns 404 ENODEV when device is not owned by any extension', async () => {
        const res = await fetch(`${HTTP_BASE}/v1/dev/tab-999/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selector: '#btn' }),
        });
        expect(res.status).toBe(404);
        const body = (await res.json());
        expect(body.errno).toBe('ENODEV');
    });
});
// ---------------------------------------------------------------------------
// Timeout handling
// ---------------------------------------------------------------------------
describe('Timeout handling', () => {
    it('returns ETIMEDOUT when extension does not respond in time', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        const hello = {
            type: 'hello',
            clientId: 'test-client-4',
            version: '0.1.0',
            tabs: [{ deviceId: 'tab-400', tabId: 400, url: 'https://slow.com' }],
        };
        ws.send(JSON.stringify(hello));
        await new Promise((r) => setTimeout(r, 50));
        // Extension receives message but never responds
        ws.on('message', () => {
            // Intentionally do nothing
        });
        // Use a very short timeout for the test
        const callPromise = extBridge.callDevice({
            deviceId: 'tab-400',
            op: 'click',
            payload: { selector: '#btn' },
            timeoutMs: 100,
        });
        await expect(callPromise).rejects.toMatchObject({
            errno: 'ETIMEDOUT',
        });
        ws.close();
    }, 10_000);
});
// ---------------------------------------------------------------------------
// Cleanup on disconnect
// ---------------------------------------------------------------------------
describe('Cleanup on disconnect', () => {
    it('removes owned devices when extension disconnects', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        const hello = {
            type: 'hello',
            clientId: 'test-client-5',
            version: '0.1.0',
            tabs: [{ deviceId: 'tab-500', tabId: 500, url: 'https://cleanup.com' }],
        };
        ws.send(JSON.stringify(hello));
        await new Promise((r) => setTimeout(r, 50));
        expect(extBridge.ownsDevice('tab-500')).toBe(true);
        ws.close();
        await new Promise((r) => setTimeout(r, 100));
        expect(extBridge.ownsDevice('tab-500')).toBe(false);
    });
});
//# sourceMappingURL=ext-bridge.test.js.map