/**
 * Integration test: Browser Adapter + Preflight checks.
 *
 * Tests against the LIVE Gemini UI on the existing Chromium instance.
 * CDP port: 18800
 */
import { describe, it, expect, afterAll } from 'vitest';
import { BrowserAdapter } from '../../src/browser/adapter.js';
import { resolveSelector } from '../../src/browser/selector-resolver.js';
import * as selectors from '../../src/selectors/gemini.v1.js';

let adapter: BrowserAdapter;

describe('Browser Adapter + Preflight', () => {
  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should connect to Chromium via CDP', async () => {
    adapter = new BrowserAdapter();
    await adapter.connect();
    expect(adapter.page).not.toBeNull();
  });

  it('should pass all preflight checks', async () => {
    const result = await adapter.preflight();
    console.log('Preflight result:', result);

    expect(result.browserConnected).toBe(true);
    expect(result.geminiLoaded).toBe(true);
    expect(result.loggedIn).toBe(true);
    expect(result.inputVisible).toBe(true);
  });

  it('should resolve chat input selector', async () => {
    const input = await resolveSelector(adapter.page!, selectors.CHAT_INPUT, 10_000);
    expect(input).not.toBeNull();
    console.log('Chat input found');
  });

  it('should resolve new chat selector', async () => {
    const newChat = await resolveSelector(adapter.page!, selectors.NEW_CHAT, 10_000);
    expect(newChat).not.toBeNull();
    console.log('New chat link found');
  });

  it('should resolve tools button selector', async () => {
    const tools = await resolveSelector(adapter.page!, selectors.TOOLS_BUTTON, 10_000);
    expect(tools).not.toBeNull();
    console.log('Tools button found');
  });

  it('should resolve mode picker selector', async () => {
    const picker = await resolveSelector(adapter.page!, selectors.MODE_PICKER, 10_000);
    expect(picker).not.toBeNull();
    console.log('Mode picker found');
  });
});
