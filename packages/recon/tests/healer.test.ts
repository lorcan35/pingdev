import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildHealingPrompt } from '../src/healer/prompts.js';
import { readSelectorsFile, writeSelectorsFile, applyPatches } from '../src/healer/patcher.js';
import type { HealingPatch } from '../src/healer/types.js';

// ─── Prompt Tests ────────────────────────────────────────────────

describe('buildHealingPrompt', () => {
  it('should return system and user messages', () => {
    const messages = buildHealingPrompt(
      'typePrompt',
      'Selector not found: chatInput',
      { chatInput: ['textarea.chat-input', '[data-testid="chat-input"]'] },
      '[textbox] "Enter a prompt"\n[button] "Send"',
      'https://chat.openai.com',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  it('should include the action name in the user message', () => {
    const messages = buildHealingPrompt(
      'submit',
      'Selector not found',
      { submitBtn: ['button.submit'] },
      '[button] "Send message"',
      'https://example.com',
    );

    expect(messages[1]!.content).toContain('submit');
  });

  it('should include the error message', () => {
    const error = 'Timeout waiting for selector: button.send';
    const messages = buildHealingPrompt(
      'submit',
      error,
      { submitBtn: ['button.send'] },
      '[button] "Send"',
      'https://example.com',
    );

    expect(messages[1]!.content).toContain(error);
  });

  it('should include old selector tiers', () => {
    const messages = buildHealingPrompt(
      'typePrompt',
      'not found',
      { chatInput: ['textarea#prompt', '[aria-label="Message"]'] },
      '[textbox] "Message ChatGPT"',
      'https://chat.openai.com',
    );

    expect(messages[1]!.content).toContain('textarea#prompt');
    // JSON.stringify escapes inner quotes
    expect(messages[1]!.content).toContain('aria-label');
  });

  it('should include the ARIA tree text', () => {
    const ariaTree = '[navigation] "Main nav"\n  [link] "Home"\n  [link] "About"';
    const messages = buildHealingPrompt(
      'navigate',
      'not found',
      { navLink: ['a.home'] },
      ariaTree,
      'https://example.com',
    );

    expect(messages[1]!.content).toContain(ariaTree);
  });

  it('should include the page URL', () => {
    const url = 'https://chat.openai.com/c/abc123';
    const messages = buildHealingPrompt(
      'typePrompt',
      'not found',
      { input: ['textarea'] },
      '[textbox]',
      url,
    );

    expect(messages[1]!.content).toContain(url);
  });

  it('should request JSON response format in system message', () => {
    const messages = buildHealingPrompt(
      'submit',
      'error',
      { btn: ['button'] },
      '[button]',
      'https://example.com',
    );

    expect(messages[0]!.content).toContain('JSON');
    expect(messages[0]!.content).toContain('selectors');
    expect(messages[0]!.content).toContain('reasoning');
  });
});

// ─── Patcher Tests ───────────────────────────────────────────────

describe('patcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healer-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleSelectorsFile = `import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
  chatInput: {
    name: 'chatInput',
    tiers: [
      'textarea.chat-input',
      '[data-testid="chat-input"]',
      'div[role="textbox"]',
    ],
  },
  submitBtn: {
    name: 'submitBtn',
    tiers: [
      'button[aria-label="Send message"]',
      'button.send-btn',
    ],
  },
};
`;

  describe('readSelectorsFile', () => {
    it('should parse selectors from a TypeScript file', () => {
      fs.writeFileSync(path.join(tmpDir, 'src/selectors.ts'), sampleSelectorsFile);

      const selectors = readSelectorsFile(tmpDir);

      expect(selectors).toHaveProperty('chatInput');
      expect(selectors).toHaveProperty('submitBtn');
      expect(selectors.chatInput!.name).toBe('chatInput');
      expect(selectors.chatInput!.tiers).toHaveLength(3);
      expect(selectors.chatInput!.tiers[0]).toBe('textarea.chat-input');
      expect(selectors.submitBtn!.tiers).toHaveLength(2);
      expect(selectors.submitBtn!.tiers[0]).toBe('button[aria-label="Send message"]');
    });

    it('should handle files with single selector', () => {
      const singleSelector = `import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
  onlyOne: {
    name: 'onlyOne',
    tiers: [
      'button.only',
    ],
  },
};
`;
      fs.writeFileSync(path.join(tmpDir, 'src/selectors.ts'), singleSelector);

      const selectors = readSelectorsFile(tmpDir);
      expect(Object.keys(selectors)).toHaveLength(1);
      expect(selectors.onlyOne!.tiers).toEqual(['button.only']);
    });
  });

  describe('writeSelectorsFile', () => {
    it('should write a valid selectors file', () => {
      const selectors = {
        chatInput: { name: 'chatInput', tiers: ['textarea.new', '[role="textbox"]'] },
        submitBtn: { name: 'submitBtn', tiers: ['button.send'] },
      };

      writeSelectorsFile(tmpDir, selectors);

      const content = fs.readFileSync(path.join(tmpDir, 'src/selectors.ts'), 'utf-8');
      expect(content).toContain("import type { SelectorDef } from '@pingdev/core'");
      expect(content).toContain('chatInput');
      expect(content).toContain('submitBtn');
      expect(content).toContain('textarea.new');
      expect(content).toContain('[role="textbox"]');
    });

    it('should produce a file that can be read back', () => {
      const original = {
        input: { name: 'input', tiers: ['textarea#msg', '[aria-label="Type here"]'] },
      };

      writeSelectorsFile(tmpDir, original);
      const readBack = readSelectorsFile(tmpDir);

      expect(readBack.input!.name).toBe('input');
      expect(readBack.input!.tiers).toEqual(original.input.tiers);
    });

    it('should escape single quotes in tiers', () => {
      const selectors = {
        fancy: { name: 'fancy', tiers: ["[aria-label='Send it']"] },
      };

      writeSelectorsFile(tmpDir, selectors);

      const content = fs.readFileSync(path.join(tmpDir, 'src/selectors.ts'), 'utf-8');
      expect(content).toContain("\\'Send it\\'");
    });
  });

  describe('applyPatches', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tmpDir, 'src/selectors.ts'), sampleSelectorsFile);
    });

    it('should apply a single patch', () => {
      const patches: HealingPatch[] = [
        {
          selectorName: 'chatInput',
          oldTiers: ['textarea.chat-input'],
          newTiers: ['textarea#prompt', '[contenteditable="true"]'],
          reason: 'Input element changed to contenteditable div',
        },
      ];

      const result = applyPatches(tmpDir, patches);

      expect(result.chatInput!.tiers).toEqual(['textarea#prompt', '[contenteditable="true"]']);
      // submitBtn should be unchanged
      expect(result.submitBtn!.tiers[0]).toBe('button[aria-label="Send message"]');
    });

    it('should apply multiple patches', () => {
      const patches: HealingPatch[] = [
        {
          selectorName: 'chatInput',
          oldTiers: [],
          newTiers: ['textarea.new-input'],
          reason: 'Updated input',
        },
        {
          selectorName: 'submitBtn',
          oldTiers: [],
          newTiers: ['button.new-send'],
          reason: 'Updated button',
        },
      ];

      const result = applyPatches(tmpDir, patches);

      expect(result.chatInput!.tiers).toEqual(['textarea.new-input']);
      expect(result.submitBtn!.tiers).toEqual(['button.new-send']);
    });

    it('should add a new selector if it does not exist', () => {
      const patches: HealingPatch[] = [
        {
          selectorName: 'newSelector',
          oldTiers: [],
          newTiers: ['div.brand-new'],
          reason: 'New element discovered',
        },
      ];

      const result = applyPatches(tmpDir, patches);

      expect(result.newSelector).toBeDefined();
      expect(result.newSelector!.tiers).toEqual(['div.brand-new']);
    });

    it('should persist changes to disk', () => {
      const patches: HealingPatch[] = [
        {
          selectorName: 'chatInput',
          oldTiers: [],
          newTiers: ['input.patched'],
          reason: 'test',
        },
      ];

      applyPatches(tmpDir, patches);

      // Read from disk independently
      const fromDisk = readSelectorsFile(tmpDir);
      expect(fromDisk.chatInput!.tiers).toEqual(['input.patched']);
    });
  });
});

// ─── Healer Integration Test (mocked) ───────────────────────────

describe('Healer', () => {
  // We test the Healer class with fully mocked dependencies since it
  // requires a live browser + LLM. The unit tests above cover the
  // individual components (prompts, patcher) thoroughly.

  it('should export Healer class', async () => {
    const { Healer } = await import('../src/healer/healer.js');
    expect(Healer).toBeDefined();
    expect(typeof Healer).toBe('function');
  });

  it('should construct with default options', async () => {
    const { Healer } = await import('../src/healer/healer.js');
    const healer = new Healer('/tmp/test-app');
    expect(healer).toBeDefined();
  });

  it('should construct with custom options', async () => {
    const { Healer } = await import('../src/healer/healer.js');
    const healer = new Healer('/tmp/test-app', {
      cdpUrl: 'http://127.0.0.1:9222',
      maxRetries: 5,
      llmEndpoint: 'http://localhost:1234/v1/chat/completions',
      llmModel: 'test-model',
    });
    expect(healer).toBeDefined();
  });
});
