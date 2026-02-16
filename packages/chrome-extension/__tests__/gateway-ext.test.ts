// Integration test for gateway WebSocket endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';

describe('Gateway Extension Bridge', () => {
  const GATEWAY_URL = 'ws://localhost:3500/ext';
  let ws: WebSocket | null = null;

  afterAll(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should accept WebSocket connection at /ext', async () => {
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(GATEWAY_URL);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        expect(ws?.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  it('should handle hello message', async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const helloMsg = {
      type: 'hello',
      clientId: 'test-client-123',
      version: '0.1.0',
      tabs: [
        {
          deviceId: 'chrome-100',
          tabId: 100,
          url: 'https://example.com',
          title: 'Example',
        },
      ],
    };

    ws.send(JSON.stringify(helloMsg));

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No error = success (gateway should accept hello)
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('should handle share_update message', async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const updateMsg = {
      type: 'share_update',
      clientId: 'test-client-123',
      tabs: [
        {
          deviceId: 'chrome-100',
          tabId: 100,
          url: 'https://example.com',
          title: 'Example',
        },
        {
          deviceId: 'chrome-200',
          tabId: 200,
          url: 'https://test.com',
          title: 'Test',
        },
      ],
    };

    ws.send(JSON.stringify(updateMsg));

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('should receive device_request and respond', async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Send hello first to register device
    const helloMsg = {
      type: 'hello',
      clientId: 'test-client-456',
      version: '0.1.0',
      tabs: [
        {
          deviceId: 'chrome-300',
          tabId: 300,
          url: 'https://example.com',
          title: 'Example',
        },
      ],
    };

    ws.send(JSON.stringify(helloMsg));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Listen for incoming device_request
    const messagePromise = new Promise<any>((resolve) => {
      ws!.once('message', (data) => {
        const msg = JSON.parse(data.toString());
        resolve(msg);
      });
    });

    // Simulate gateway sending a device_request
    // (In real scenario, this would come from HTTP /v1/dev/chrome-300/click)
    const deviceRequest = {
      type: 'device_request',
      id: 'req-123',
      deviceId: 'chrome-300',
      op: 'click',
      payload: { selector: '#button' },
    };

    // For this test, we'll manually send it to ourselves
    ws.send(JSON.stringify(deviceRequest));

    const received = await messagePromise;
    expect(received.type).toBe('device_request');
    expect(received.id).toBe('req-123');

    // Send response
    const deviceResponse = {
      type: 'device_response',
      id: 'req-123',
      ok: true,
      result: { success: true },
    };

    ws.send(JSON.stringify(deviceResponse));

    // No error = success
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('should handle connection close gracefully', async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    await new Promise<void>((resolve) => {
      ws!.on('close', () => {
        resolve();
      });

      ws!.close();
    });

    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
