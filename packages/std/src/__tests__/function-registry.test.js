// @pingdev/std — Tests for Tab-as-a-Function (function registry)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionRegistry } from '../function-registry.js';
// Mock ExtensionBridge
function createMockBridge(tabs = []) {
    const callResults = new Map();
    const bridge = {
        listSharedTabs: vi.fn(() => [{
                clientId: 'test-client',
                tabs: tabs.map(t => ({
                    deviceId: t.deviceId,
                    tabId: parseInt(t.deviceId.replace('tab-', ''), 10) || 1,
                    url: t.url,
                    title: t.title,
                })),
            }]),
        callDevice: vi.fn(async (params) => {
            const key = `${params.deviceId}:${params.op}`;
            if (callResults.has(key))
                return callResults.get(key);
            return { ok: true, data: `mock-result-${params.op}` };
        }),
        _setResult(deviceId, op, result) {
            callResults.set(`${deviceId}:${op}`, result);
        },
    };
    return bridge;
}
describe('FunctionRegistry', () => {
    let bridge;
    let registry;
    beforeEach(() => {
        bridge = createMockBridge([
            { deviceId: 'tab-1', url: 'https://mail.google.com/inbox', title: 'Gmail' },
            { deviceId: 'tab-2', url: 'https://www.amazon.com/dp/B123', title: 'Amazon Product' },
        ]);
        registry = new FunctionRegistry(bridge);
    });
    describe('listAll', () => {
        it('returns functions for all connected tabs', () => {
            const fns = registry.listAll();
            expect(fns.length).toBeGreaterThan(0);
            // Should have functions for both tabs (mail and amazon)
            const names = fns.map(f => f.name);
            expect(names.some(n => n.startsWith('mail.'))).toBe(true);
            expect(names.some(n => n.startsWith('amazon.'))).toBe(true);
        });
        it('each tab gets generic operations', () => {
            const fns = registry.listAll();
            const mailFns = fns.filter(f => f.name.startsWith('mail.'));
            const ops = mailFns.map(f => f.name.split('.')[1]);
            expect(ops).toContain('extract');
            expect(ops).toContain('click');
            expect(ops).toContain('type');
            expect(ops).toContain('read');
            expect(ops).toContain('eval');
            expect(ops).toContain('discover');
        });
    });
    describe('listForApp', () => {
        it('returns functions for a specific app', () => {
            const fns = registry.listForApp('amazon');
            expect(fns).not.toBeNull();
            expect(fns.length).toBeGreaterThan(0);
            expect(fns.every(f => f.name.startsWith('amazon.'))).toBe(true);
        });
        it('returns null for unknown app', () => {
            const fns = registry.listForApp('nonexistent');
            expect(fns).toBeNull();
        });
    });
    describe('describe', () => {
        it('returns function definition by qualified name', () => {
            const fn = registry.describe('amazon.extract');
            expect(fn).not.toBeNull();
            expect(fn.name).toBe('amazon.extract');
            expect(fn.params.length).toBeGreaterThan(0);
            expect(fn.description).toBeTruthy();
        });
        it('returns null for unknown function', () => {
            const fn = registry.describe('amazon.nonexistent');
            expect(fn).toBeNull();
        });
    });
    describe('call', () => {
        it('calls extension bridge with correct parameters', async () => {
            bridge._setResult('tab-2', 'extract', { title: 'Widget', price: '$9.99' });
            const result = await registry.call('amazon.extract', { schema: { title: 'h1' } });
            expect(result).toEqual({ title: 'Widget', price: '$9.99' });
            expect(bridge.callDevice).toHaveBeenCalledWith(expect.objectContaining({
                deviceId: 'tab-2',
                op: 'extract',
                payload: { schema: { title: 'h1' } },
            }));
        });
        it('throws on invalid function name format', async () => {
            await expect(registry.call('noapp', {})).rejects.toThrow('expected "app.operation" format');
        });
        it('throws on unknown app', async () => {
            await expect(registry.call('unknown.extract', {})).rejects.toThrow('not found');
        });
        it('throws on missing required params', async () => {
            await expect(registry.call('amazon.extract', {})).rejects.toThrow('Missing required parameter');
        });
    });
    describe('batch', () => {
        it('executes multiple calls in sequence', async () => {
            bridge._setResult('tab-2', 'read', 'Hello World');
            bridge._setResult('tab-2', 'click', { clicked: true });
            const results = await registry.batch([
                { function: 'amazon.read', params: { selector: 'h1' } },
                { function: 'amazon.click', params: { selector: '.btn' } },
            ]);
            expect(results).toHaveLength(2);
            expect(results[0]).toBe('Hello World');
            expect(results[1]).toEqual({ clicked: true });
        });
    });
    describe('getTabId', () => {
        it('returns device ID for known app', () => {
            expect(registry.getTabId('amazon')).toBe('tab-2');
        });
        it('returns null for unknown app', () => {
            expect(registry.getTabId('unknown')).toBeNull();
        });
    });
});
//# sourceMappingURL=function-registry.test.js.map