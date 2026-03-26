/**
 * Integration test: Tool activation/deactivation + Mode switching.
 *
 * Tests against the LIVE Gemini UI on the existing Chromium instance.
 * CDP port: 18800, DISPLAY=:1
 *
 * Each test activates a tool → verifies active → deactivates → verifies inactive.
 * Then tests mode switching between Fast, Thinking, and Pro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserAdapter } from '../../src/browser/adapter.js';
import type { GeminiTool, GeminiMode } from '../../src/types/index.js';

let adapter: BrowserAdapter;

beforeAll(async () => {
  adapter = new BrowserAdapter();
  await adapter.connect();
  await adapter.newChat();
});

afterAll(async () => {
  if (adapter) await adapter.disconnect();
});

describe('Tool Activation/Deactivation', () => {
  // Helper: test a single tool's activate → verify → deactivate → verify cycle
  const testTool = (toolName: GeminiTool, label: string) => {
    describe(label, () => {
      it(`should activate ${label}`, async () => {
        await adapter.activateTool(toolName);
        const active = await adapter.isToolActive(toolName);
        expect(active).toBe(true);
      });

      it(`should deactivate ${label}`, async () => {
        await adapter.deactivateTool(toolName);
        const active = await adapter.isToolActive(toolName);
        expect(active).toBe(false);
      });
    });
  };

  testTool('deep_research', 'Deep Research');
  testTool('create_videos', 'Create Videos');
  testTool('create_images', 'Create Images');
  testTool('canvas', 'Canvas');
  testTool('guided_learning', 'Guided Learning');
  testTool('deep_think', 'Deep Think');
});

describe('Mode Switching', () => {
  beforeAll(async () => {
    // Ensure clean state — navigate to new chat
    await adapter.newChat();
  });

  it('should read the current mode', async () => {
    const mode = await adapter.getCurrentMode();
    expect(mode).not.toBeNull();
    expect(['fast', 'thinking', 'pro']).toContain(mode);
    console.log('Current mode:', mode);
  });

  const testMode = (mode: GeminiMode, label: string) => {
    it(`should switch to ${label} mode`, async () => {
      await adapter.switchMode(mode);
      const current = await adapter.getCurrentMode();
      expect(current).toBe(mode);
      console.log(`Switched to ${label} mode`);
    });
  };

  testMode('fast', 'Fast');
  testMode('thinking', 'Thinking');
  testMode('pro', 'Pro');
  // Switch back to Fast as the default for subsequent tests
  testMode('fast', 'Fast (reset)');
});
