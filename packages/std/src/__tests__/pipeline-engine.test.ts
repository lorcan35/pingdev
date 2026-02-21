// @pingdev/std — Tests for Cross-Tab Data Pipes (pipeline engine)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineEngine } from '../pipeline-engine.js';
import type { PipelineDef } from '../types.js';

// Mock ExtensionBridge
function createMockBridge() {
  const callResults = new Map<string, unknown>();
  const tabMap: Array<{ deviceId: string; url: string; title?: string }> = [];

  const bridge = {
    callDevice: vi.fn(async (params: { deviceId: string; op: string; payload: unknown }) => {
      const key = `${params.deviceId}:${params.op}`;
      if (callResults.has(key)) return callResults.get(key);
      return { data: `mock-${params.op}` };
    }),
    listSharedTabs: vi.fn(() => [{
      clientId: 'test-client',
      tabs: tabMap.map(t => ({
        deviceId: t.deviceId,
        tabId: 1,
        url: t.url,
        title: t.title,
      })),
    }]),
    _setResult(deviceId: string, op: string, result: unknown) {
      callResults.set(`${deviceId}:${op}`, result);
    },
    _addTab(deviceId: string, url: string, title?: string) {
      tabMap.push({ deviceId, url, title });
    },
  };

  return bridge as any;
}

describe('PipelineEngine', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let engine: PipelineEngine;

  beforeEach(() => {
    bridge = createMockBridge();
    bridge._addTab('tab-1', 'https://www.amazon.com/product/1', 'Amazon Product');
    bridge._addTab('tab-2', 'https://www.ebay.com/item/1', 'eBay Item');
    bridge._addTab('tab-3', 'https://slack.com/messages', 'Slack');
    engine = new PipelineEngine(bridge);
  });

  describe('validate', () => {
    it('accepts a valid pipeline', () => {
      const errors = engine.validate({
        name: 'test',
        steps: [
          { id: 's1', op: 'extract', tab: 'tab-1', schema: { price: '.price' }, output: 'price' },
          { id: 's2', op: 'transform', template: 'Price is {{price.value}}', output: 'msg' },
        ],
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects pipeline without name', () => {
      const errors = engine.validate({ name: '', steps: [{ id: 's1', op: 'transform', template: 'x' }] });
      expect(errors.some(e => e.includes('name'))).toBe(true);
    });

    it('rejects pipeline without steps', () => {
      const errors = engine.validate({ name: 'test', steps: [] });
      expect(errors.some(e => e.includes('at least one step'))).toBe(true);
    });

    it('rejects duplicate step IDs', () => {
      const errors = engine.validate({
        name: 'test',
        steps: [
          { id: 's1', op: 'transform', template: 'a' },
          { id: 's1', op: 'transform', template: 'b' },
        ],
      });
      expect(errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('rejects tab-based ops without tab', () => {
      const errors = engine.validate({
        name: 'test',
        steps: [{ id: 's1', op: 'extract', schema: { title: 'h1' } }],
      });
      expect(errors.some(e => e.includes('requires a "tab"'))).toBe(true);
    });

    it('rejects transform without template', () => {
      const errors = engine.validate({
        name: 'test',
        steps: [{ id: 's1', op: 'transform' }],
      });
      expect(errors.some(e => e.includes('template'))).toBe(true);
    });
  });

  describe('run', () => {
    it('executes a simple sequential pipeline', async () => {
      // Realistic response: extension wraps extract data in { result, _meta }
      bridge._setResult('tab-1', 'extract', { data: { result: { price: '$29.99' }, _meta: { price: '1-match' } } });

      const result = await engine.run({
        name: 'simple',
        steps: [
          { id: 's1', op: 'extract', tab: 'tab-1', schema: { price: '.price' }, output: 'extracted' },
          { id: 's2', op: 'transform', template: 'Price: {{extracted.price}}', output: 'msg' },
        ],
      });

      expect(result.name).toBe('simple');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[1].status).toBe('ok');
      expect(result.steps[1].result).toBe('Price: $29.99');
      expect(result.variables['msg']).toBe('Price: $29.99');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('auto-assigns step id as variable name when output is omitted', async () => {
      bridge._setResult('tab-1', 'extract', { data: { result: { title: 'Widget' }, _meta: {} } });

      const result = await engine.run({
        name: 'auto-output',
        steps: [
          { id: 'data', op: 'extract', tab: 'tab-1', schema: { title: 'h1' } },
          { id: 'msg', op: 'transform', template: 'Title: {{data.title}}' },
        ],
      });

      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[1].status).toBe('ok');
      expect(result.steps[1].result).toBe('Title: Widget');
      expect(result.variables['data']).toEqual({ title: 'Widget' });
    });

    it('executes parallel steps', async () => {
      bridge._setResult('tab-1', 'extract', { data: { result: { price: '$29.99' }, _meta: {} } });
      bridge._setResult('tab-2', 'extract', { data: { result: { price: '$24.99' }, _meta: {} } });

      const result = await engine.run({
        name: 'parallel-compare',
        steps: [
          { id: 's1', op: 'extract', tab: 'tab-1', schema: { price: '.price' }, output: 'amazon' },
          { id: 's2', op: 'extract', tab: 'tab-2', schema: { price: '.price' }, output: 'ebay' },
          { id: 's3', op: 'transform', template: 'Amazon: {{amazon.price}}, eBay: {{ebay.price}}', output: 'summary' },
        ],
        parallel: ['s1', 's2'],
      });

      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[1].status).toBe('ok');
      expect(result.steps[2].status).toBe('ok');
      expect(result.variables['summary']).toBe('Amazon: $29.99, eBay: $24.99');
    });

    it('handles onError: skip', async () => {
      bridge.callDevice.mockRejectedValueOnce(new Error('Element not found'));

      const result = await engine.run({
        name: 'skip-test',
        steps: [
          { id: 's1', op: 'extract', tab: 'tab-1', schema: { x: '.missing' }, onError: 'skip' },
          { id: 's2', op: 'transform', template: 'continued', output: 'msg' },
        ],
      });

      expect(result.steps[0].status).toBe('skipped');
      expect(result.steps[1].status).toBe('ok');
      expect(result.steps[1].result).toBe('continued');
    });

    it('handles onError: abort (default)', async () => {
      bridge.callDevice.mockRejectedValueOnce(new Error('Timeout'));

      const result = await engine.run({
        name: 'abort-test',
        steps: [
          { id: 's1', op: 'extract', tab: 'tab-1', schema: { x: '.missing' } },
          { id: 's2', op: 'transform', template: 'never reached', output: 'msg' },
        ],
      });

      expect(result.steps[0].status).toBe('error');
      expect(result.steps[1].status).toBe('skipped');
    });

    it('resolves tab names by URL match', async () => {
      bridge._setResult('tab-1', 'extract', { data: { result: { title: 'Widget' }, _meta: {} } });

      const result = await engine.run({
        name: 'name-resolve',
        steps: [
          { id: 's1', op: 'extract', tab: 'amazon', schema: { title: 'h1' }, output: 'data' },
        ],
      });

      expect(result.steps[0].status).toBe('ok');
      expect(bridge.callDevice).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'tab-1' }),
      );
    });

    it('handles click and type operations', async () => {
      bridge._setResult('tab-3', 'type', { ok: true });

      const result = await engine.run({
        name: 'action-pipeline',
        steps: [
          { id: 's1', op: 'transform', template: 'Hello from pipeline!', output: 'text' },
          { id: 's2', op: 'type', tab: 'tab-3', selector: '#msg', text: '{{text}}' },
        ],
      });

      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[1].status).toBe('ok');
    });

    it('normalizes read params from nested params object', async () => {
      bridge._setResult('tab-1', 'read', { data: 'Widget title' });

      const result = await engine.run({
        name: 'read-params-shape',
        steps: [
          { id: 's1', op: 'read', tab: 'tab-1', params: { selector: '.title' } as any, output: 'title' } as any,
        ],
      });

      expect(result.steps[0].status).toBe('ok');
      expect(bridge.callDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'tab-1',
          op: 'read',
          payload: { selector: '.title' },
        }),
      );
    });

    it('normalizes read params from schema.selector fallback', async () => {
      bridge._setResult('tab-1', 'read', { data: '$19.99' });

      const result = await engine.run({
        name: 'read-schema-selector',
        steps: [
          { id: 's1', op: 'read', tab: 'tab-1', schema: { selector: '.price' } as any, output: 'price' } as any,
        ],
      });

      expect(result.steps[0].status).toBe('ok');
      expect(bridge.callDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'tab-1',
          op: 'read',
          payload: { selector: '.price' },
        }),
      );
    });
  });

  describe('parsePipeShorthand', () => {
    it('parses extract|transform|type pipe', () => {
      const pipeline = PipelineEngine.parsePipeShorthand(
        'extract:amazon:.price | transform:Deal: {{s1_result.value}} | type:slack:#msg',
      );
      expect(pipeline.steps).toHaveLength(3);
      expect(pipeline.steps[0].op).toBe('extract');
      expect(pipeline.steps[0].tab).toBe('amazon');
      expect(pipeline.steps[1].op).toBe('transform');
      expect(pipeline.steps[2].op).toBe('type');
      expect(pipeline.steps[2].tab).toBe('slack');
    });

    it('parses simple read pipe', () => {
      const pipeline = PipelineEngine.parsePipeShorthand('read:tab-1:.title');
      expect(pipeline.steps).toHaveLength(1);
      expect(pipeline.steps[0].op).toBe('read');
      expect(pipeline.steps[0].tab).toBe('tab-1');
    });

    it('assigns sequential IDs', () => {
      const pipeline = PipelineEngine.parsePipeShorthand('extract:a:.x | transform:y');
      expect(pipeline.steps[0].id).toBe('s1');
      expect(pipeline.steps[1].id).toBe('s2');
    });
  });
});
