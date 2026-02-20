// @pingdev/std — Tests for Record/Replay Engine

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplayEngine } from '../replay-engine.js';
import type { Recording } from '../types.js';

// Mock ExtensionBridge
function createMockBridge() {
  const failSelectors = new Set<string>();

  const bridge = {
    callDevice: vi.fn(async (params: { deviceId: string; op: string; payload: unknown }) => {
      const payload = params.payload as Record<string, unknown> | undefined;
      const selector = payload?.selector as string | undefined;
      if (selector && failSelectors.has(selector)) {
        throw new Error(`Element not found: ${selector}`);
      }
      return { ok: true };
    }),
    _failSelector(sel: string) {
      failSelectors.add(sel);
    },
  };

  return bridge as any;
}

function makeRecording(actions: Recording['actions']): Recording {
  return {
    id: 'rec-1',
    startedAt: Date.now(),
    url: 'https://example.com',
    actions,
  };
}

describe('ReplayEngine', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let engine: ReplayEngine;

  beforeEach(() => {
    bridge = createMockBridge();
    engine = new ReplayEngine(bridge);
  });

  describe('replay', () => {
    it('replays click actions', async () => {
      const recording = makeRecording([
        {
          type: 'click',
          timestamp: 1000,
          selectors: { css: '#btn' },
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[0].selector).toBe('#btn');
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    it('replays input (type) actions', async () => {
      const recording = makeRecording([
        {
          type: 'input',
          timestamp: 1000,
          selectors: { css: '#email' },
          value: 'hello@world.com',
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('ok');
      expect(bridge.callDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'type',
          payload: expect.objectContaining({ text: 'hello@world.com' }),
        }),
      );
    });

    it('replays keydown actions', async () => {
      const recording = makeRecording([
        {
          type: 'keydown',
          timestamp: 1000,
          selectors: {},
          value: 'Enter',
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('ok');
      expect(bridge.callDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'press',
          payload: { key: 'Enter' },
        }),
      );
    });

    it('replays navigate actions', async () => {
      const recording = makeRecording([
        {
          type: 'navigate',
          timestamp: 1000,
          selectors: {},
          value: 'https://example.com/page2',
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('ok');
    });

    it('replays scroll actions', async () => {
      const recording = makeRecording([
        {
          type: 'scroll',
          timestamp: 1000,
          selectors: {},
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('ok');
    });

    it('falls back to alternative selectors on failure', async () => {
      bridge._failSelector('#btn');

      const recording = makeRecording([
        {
          type: 'click',
          timestamp: 1000,
          selectors: {
            css: '#btn',
            ariaLabel: 'Submit',
          },
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('ok');
      expect(result.steps[0].selector).toBe('[aria-label="Submit"]');
    });

    it('records error when all selectors fail', async () => {
      bridge._failSelector('#btn');
      bridge._failSelector('[aria-label="Submit"]');

      const recording = makeRecording([
        {
          type: 'click',
          timestamp: 1000,
          selectors: { css: '#btn', ariaLabel: 'Submit' },
        },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps[0].status).toBe('error');
      expect(result.errorCount).toBe(1);
    });

    it('handles multiple actions in sequence', async () => {
      const recording = makeRecording([
        { type: 'click', timestamp: 1000, selectors: { css: '#email-field' } },
        { type: 'input', timestamp: 1500, selectors: { css: '#email-field' }, value: 'test@test.com' },
        { type: 'click', timestamp: 2000, selectors: { css: '#submit' } },
      ]);

      const result = await engine.replay('tab-1', recording);
      expect(result.steps).toHaveLength(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.recording.actionCount).toBe(3);
    });

    it('respects speed option for delays', async () => {
      const recording = makeRecording([
        { type: 'click', timestamp: 1000, selectors: { css: '#a' } },
        { type: 'click', timestamp: 2000, selectors: { css: '#b' } },
      ]);

      // speed=0 means instant (no delays)
      const startTime = Date.now();
      await engine.replay('tab-1', recording, { speed: 0 });
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500); // should be near-instant
    });
  });
});
