"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const prompts_js_1 = require("../src/healer/prompts.js");
const patcher_js_1 = require("../src/healer/patcher.js");
// ─── Prompt Tests ────────────────────────────────────────────────
(0, vitest_1.describe)('buildHealingPrompt', () => {
    (0, vitest_1.it)('should return system and user messages', () => {
        const messages = (0, prompts_js_1.buildHealingPrompt)('typePrompt', 'Selector not found: chatInput', { chatInput: ['textarea.chat-input', '[data-testid="chat-input"]'] }, '[textbox] "Enter a prompt"\n[button] "Send"', 'https://chat.openai.com');
        (0, vitest_1.expect)(messages).toHaveLength(2);
        (0, vitest_1.expect)(messages[0].role).toBe('system');
        (0, vitest_1.expect)(messages[1].role).toBe('user');
    });
    (0, vitest_1.it)('should include the action name in the user message', () => {
        const messages = (0, prompts_js_1.buildHealingPrompt)('submit', 'Selector not found', { submitBtn: ['button.submit'] }, '[button] "Send message"', 'https://example.com');
        (0, vitest_1.expect)(messages[1].content).toContain('submit');
    });
    (0, vitest_1.it)('should include the error message', () => {
        const error = 'Timeout waiting for selector: button.send';
        const messages = (0, prompts_js_1.buildHealingPrompt)('submit', error, { submitBtn: ['button.send'] }, '[button] "Send"', 'https://example.com');
        (0, vitest_1.expect)(messages[1].content).toContain(error);
    });
    (0, vitest_1.it)('should include old selector tiers', () => {
        const messages = (0, prompts_js_1.buildHealingPrompt)('typePrompt', 'not found', { chatInput: ['textarea#prompt', '[aria-label="Message"]'] }, '[textbox] "Message ChatGPT"', 'https://chat.openai.com');
        (0, vitest_1.expect)(messages[1].content).toContain('textarea#prompt');
        // JSON.stringify escapes inner quotes
        (0, vitest_1.expect)(messages[1].content).toContain('aria-label');
    });
    (0, vitest_1.it)('should include the ARIA tree text', () => {
        const ariaTree = '[navigation] "Main nav"\n  [link] "Home"\n  [link] "About"';
        const messages = (0, prompts_js_1.buildHealingPrompt)('navigate', 'not found', { navLink: ['a.home'] }, ariaTree, 'https://example.com');
        (0, vitest_1.expect)(messages[1].content).toContain(ariaTree);
    });
    (0, vitest_1.it)('should include the page URL', () => {
        const url = 'https://chat.openai.com/c/abc123';
        const messages = (0, prompts_js_1.buildHealingPrompt)('typePrompt', 'not found', { input: ['textarea'] }, '[textbox]', url);
        (0, vitest_1.expect)(messages[1].content).toContain(url);
    });
    (0, vitest_1.it)('should request JSON response format in system message', () => {
        const messages = (0, prompts_js_1.buildHealingPrompt)('submit', 'error', { btn: ['button'] }, '[button]', 'https://example.com');
        (0, vitest_1.expect)(messages[0].content).toContain('JSON');
        (0, vitest_1.expect)(messages[0].content).toContain('selectors');
        (0, vitest_1.expect)(messages[0].content).toContain('reasoning');
    });
});
// ─── Patcher Tests ───────────────────────────────────────────────
(0, vitest_1.describe)('patcher', () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healer-test-'));
        fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    });
    (0, vitest_1.afterEach)(() => {
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
    (0, vitest_1.describe)('readSelectorsFile', () => {
        (0, vitest_1.it)('should parse selectors from a TypeScript file', () => {
            fs.writeFileSync(path.join(tmpDir, 'src/selectors.ts'), sampleSelectorsFile);
            const selectors = (0, patcher_js_1.readSelectorsFile)(tmpDir);
            (0, vitest_1.expect)(selectors).toHaveProperty('chatInput');
            (0, vitest_1.expect)(selectors).toHaveProperty('submitBtn');
            (0, vitest_1.expect)(selectors.chatInput.name).toBe('chatInput');
            (0, vitest_1.expect)(selectors.chatInput.tiers).toHaveLength(3);
            (0, vitest_1.expect)(selectors.chatInput.tiers[0]).toBe('textarea.chat-input');
            (0, vitest_1.expect)(selectors.submitBtn.tiers).toHaveLength(2);
            (0, vitest_1.expect)(selectors.submitBtn.tiers[0]).toBe('button[aria-label="Send message"]');
        });
        (0, vitest_1.it)('should handle files with single selector', () => {
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
            const selectors = (0, patcher_js_1.readSelectorsFile)(tmpDir);
            (0, vitest_1.expect)(Object.keys(selectors)).toHaveLength(1);
            (0, vitest_1.expect)(selectors.onlyOne.tiers).toEqual(['button.only']);
        });
    });
    (0, vitest_1.describe)('writeSelectorsFile', () => {
        (0, vitest_1.it)('should write a valid selectors file', () => {
            const selectors = {
                chatInput: { name: 'chatInput', tiers: ['textarea.new', '[role="textbox"]'] },
                submitBtn: { name: 'submitBtn', tiers: ['button.send'] },
            };
            (0, patcher_js_1.writeSelectorsFile)(tmpDir, selectors);
            const content = fs.readFileSync(path.join(tmpDir, 'src/selectors.ts'), 'utf-8');
            (0, vitest_1.expect)(content).toContain("import type { SelectorDef } from '@pingdev/core'");
            (0, vitest_1.expect)(content).toContain('chatInput');
            (0, vitest_1.expect)(content).toContain('submitBtn');
            (0, vitest_1.expect)(content).toContain('textarea.new');
            (0, vitest_1.expect)(content).toContain('[role="textbox"]');
        });
        (0, vitest_1.it)('should produce a file that can be read back', () => {
            const original = {
                input: { name: 'input', tiers: ['textarea#msg', '[aria-label="Type here"]'] },
            };
            (0, patcher_js_1.writeSelectorsFile)(tmpDir, original);
            const readBack = (0, patcher_js_1.readSelectorsFile)(tmpDir);
            (0, vitest_1.expect)(readBack.input.name).toBe('input');
            (0, vitest_1.expect)(readBack.input.tiers).toEqual(original.input.tiers);
        });
        (0, vitest_1.it)('should escape single quotes in tiers', () => {
            const selectors = {
                fancy: { name: 'fancy', tiers: ["[aria-label='Send it']"] },
            };
            (0, patcher_js_1.writeSelectorsFile)(tmpDir, selectors);
            const content = fs.readFileSync(path.join(tmpDir, 'src/selectors.ts'), 'utf-8');
            (0, vitest_1.expect)(content).toContain("\\'Send it\\'");
        });
    });
    (0, vitest_1.describe)('applyPatches', () => {
        (0, vitest_1.beforeEach)(() => {
            fs.writeFileSync(path.join(tmpDir, 'src/selectors.ts'), sampleSelectorsFile);
        });
        (0, vitest_1.it)('should apply a single patch', () => {
            const patches = [
                {
                    selectorName: 'chatInput',
                    oldTiers: ['textarea.chat-input'],
                    newTiers: ['textarea#prompt', '[contenteditable="true"]'],
                    reason: 'Input element changed to contenteditable div',
                },
            ];
            const result = (0, patcher_js_1.applyPatches)(tmpDir, patches);
            (0, vitest_1.expect)(result.chatInput.tiers).toEqual(['textarea#prompt', '[contenteditable="true"]']);
            // submitBtn should be unchanged
            (0, vitest_1.expect)(result.submitBtn.tiers[0]).toBe('button[aria-label="Send message"]');
        });
        (0, vitest_1.it)('should apply multiple patches', () => {
            const patches = [
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
            const result = (0, patcher_js_1.applyPatches)(tmpDir, patches);
            (0, vitest_1.expect)(result.chatInput.tiers).toEqual(['textarea.new-input']);
            (0, vitest_1.expect)(result.submitBtn.tiers).toEqual(['button.new-send']);
        });
        (0, vitest_1.it)('should add a new selector if it does not exist', () => {
            const patches = [
                {
                    selectorName: 'newSelector',
                    oldTiers: [],
                    newTiers: ['div.brand-new'],
                    reason: 'New element discovered',
                },
            ];
            const result = (0, patcher_js_1.applyPatches)(tmpDir, patches);
            (0, vitest_1.expect)(result.newSelector).toBeDefined();
            (0, vitest_1.expect)(result.newSelector.tiers).toEqual(['div.brand-new']);
        });
        (0, vitest_1.it)('should persist changes to disk', () => {
            const patches = [
                {
                    selectorName: 'chatInput',
                    oldTiers: [],
                    newTiers: ['input.patched'],
                    reason: 'test',
                },
            ];
            (0, patcher_js_1.applyPatches)(tmpDir, patches);
            // Read from disk independently
            const fromDisk = (0, patcher_js_1.readSelectorsFile)(tmpDir);
            (0, vitest_1.expect)(fromDisk.chatInput.tiers).toEqual(['input.patched']);
        });
    });
});
// ─── Healer Integration Test (mocked) ───────────────────────────
(0, vitest_1.describe)('Healer', () => {
    // We test the Healer class with fully mocked dependencies since it
    // requires a live browser + LLM. The unit tests above cover the
    // individual components (prompts, patcher) thoroughly.
    (0, vitest_1.it)('should export Healer class', async () => {
        const { Healer } = await import('../src/healer/healer.js');
        (0, vitest_1.expect)(Healer).toBeDefined();
        (0, vitest_1.expect)(typeof Healer).toBe('function');
    });
    (0, vitest_1.it)('should construct with default options', async () => {
        const { Healer } = await import('../src/healer/healer.js');
        const healer = new Healer('/tmp/test-app');
        (0, vitest_1.expect)(healer).toBeDefined();
    });
    (0, vitest_1.it)('should construct with custom options', async () => {
        const { Healer } = await import('../src/healer/healer.js');
        const healer = new Healer('/tmp/test-app', {
            cdpUrl: 'http://127.0.0.1:9222',
            maxRetries: 5,
            llmEndpoint: 'http://localhost:1234/v1/chat/completions',
            llmModel: 'test-model',
        });
        (0, vitest_1.expect)(healer).toBeDefined();
    });
});
//# sourceMappingURL=healer.test.js.map