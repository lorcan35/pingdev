"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const generator_js_1 = require("../src/generator/generator.js");
const templates_js_1 = require("../src/generator/templates.js");
const mockGeminiDef = {
    name: 'gemini',
    url: 'https://gemini.google.com',
    purpose: 'AI chat assistant',
    category: 'chat',
    selectors: {
        'chat-input': { name: 'chat-input', tiers: ['[data-testid="chat-input"]', '.ql-editor'] },
        'submit-btn': { name: 'submit-btn', tiers: ['button[aria-label="Send"]', '.send-button'] },
        'response-area': { name: 'response-area', tiers: ['.response-container', '.model-response'] },
    },
    actions: [
        {
            name: 'sendMessage',
            description: 'Send a chat message',
            inputSelector: 'chat-input',
            submitTrigger: 'submit-btn',
            outputSelector: 'response-area',
            completionSignal: 'response-area visible',
            isPrimary: true,
        },
        {
            name: 'newChat',
            description: 'Start a new chat',
            isPrimary: false,
        },
    ],
    states: [
        { name: 'idle', detectionMethod: 'no loading indicator', transitions: ['typing'] },
        { name: 'typing', detectionMethod: 'input has focus', transitions: ['generating', 'idle'] },
        { name: 'generating', detectionMethod: 'loading spinner visible', indicatorSelector: '.loading', transitions: ['done', 'error'] },
        { name: 'done', detectionMethod: 'response complete', transitions: ['idle'] },
        { name: 'error', detectionMethod: 'error message visible', transitions: ['idle'] },
    ],
    features: [],
    completion: { method: 'hash_stability', pollMs: 750, stableCount: 3, maxWaitMs: 120000 },
    stateTransitions: {
        IDLE: ['TYPING'],
        TYPING: ['GENERATING', 'IDLE'],
        GENERATING: ['DONE', 'FAILED'],
        DONE: ['IDLE'],
        FAILED: ['IDLE'],
    },
};
(0, vitest_1.describe)('templates', () => {
    (0, vitest_1.describe)('generatePackageJson', () => {
        (0, vitest_1.it)('should produce valid JSON with correct name and deps', () => {
            const result = (0, templates_js_1.generatePackageJson)('gemini', 'https://gemini.google.com');
            const parsed = JSON.parse(result);
            (0, vitest_1.expect)(parsed.name).toBe('@pingapps/gemini');
            (0, vitest_1.expect)(parsed.dependencies['@pingdev/core']).toBe('^0.1.0');
            (0, vitest_1.expect)(parsed.type).toBe('commonjs');
            (0, vitest_1.expect)(parsed.scripts.build).toBe('tsc');
        });
    });
    (0, vitest_1.describe)('generateTsConfig', () => {
        (0, vitest_1.it)('should produce valid JSON with Node16 module settings', () => {
            const result = (0, templates_js_1.generateTsConfig)();
            const parsed = JSON.parse(result);
            (0, vitest_1.expect)(parsed.compilerOptions.module).toBe('Node16');
            (0, vitest_1.expect)(parsed.compilerOptions.moduleResolution).toBe('Node16');
            (0, vitest_1.expect)(parsed.compilerOptions.target).toBe('ES2022');
            (0, vitest_1.expect)(parsed.compilerOptions.strict).toBe(true);
        });
    });
    (0, vitest_1.describe)('generateSelectors', () => {
        (0, vitest_1.it)('should produce TypeScript source with SelectorDef imports and all selectors', () => {
            const result = (0, templates_js_1.generateSelectors)(mockGeminiDef.selectors);
            (0, vitest_1.expect)(result).toContain("import type { SelectorDef } from '@pingdev/core'");
            (0, vitest_1.expect)(result).toContain("'chat-input'");
            (0, vitest_1.expect)(result).toContain("'submit-btn'");
            (0, vitest_1.expect)(result).toContain("'response-area'");
            (0, vitest_1.expect)(result).toContain('[data-testid="chat-input"]');
            (0, vitest_1.expect)(result).toContain('.ql-editor');
        });
        (0, vitest_1.it)('should have correct structure with tiers arrays', () => {
            const result = (0, templates_js_1.generateSelectors)(mockGeminiDef.selectors);
            (0, vitest_1.expect)(result).toContain('tiers: [');
            (0, vitest_1.expect)(result).toContain("name: 'chat-input'");
        });
    });
    (0, vitest_1.describe)('generateStates', () => {
        (0, vitest_1.it)('should produce StateMachineConfig source with all transitions', () => {
            const result = (0, templates_js_1.generateStates)(mockGeminiDef.stateTransitions);
            (0, vitest_1.expect)(result).toContain("import type { StateMachineConfig } from '@pingdev/core'");
            (0, vitest_1.expect)(result).toContain("'IDLE': ['TYPING']");
            (0, vitest_1.expect)(result).toContain("'GENERATING': ['DONE', 'FAILED']");
            (0, vitest_1.expect)(result).toContain("initialState: 'IDLE'");
        });
    });
    (0, vitest_1.describe)('generateActionFile', () => {
        (0, vitest_1.it)('should generate an action with input, submit, and output selectors', () => {
            const result = (0, templates_js_1.generateActionFile)(mockGeminiDef.actions[0], mockGeminiDef.selectors);
            (0, vitest_1.expect)(result).toContain("import type { ActionHandler } from '@pingdev/core'");
            (0, vitest_1.expect)(result).toContain("import { selectors } from '../selectors.js'");
            (0, vitest_1.expect)(result).toContain('export const sendMessage: ActionHandler');
            (0, vitest_1.expect)(result).toContain("selectors['chat-input']");
            (0, vitest_1.expect)(result).toContain("selectors['submit-btn']");
            (0, vitest_1.expect)(result).toContain("selectors['response-area']");
            (0, vitest_1.expect)(result).toContain('input.fill(ctx.jobRequest.prompt)');
            (0, vitest_1.expect)(result).toContain('trigger.click()');
            (0, vitest_1.expect)(result).toContain('output.textContent()');
        });
        (0, vitest_1.it)('should generate a placeholder for actions without selectors', () => {
            const result = (0, templates_js_1.generateActionFile)(mockGeminiDef.actions[1], mockGeminiDef.selectors);
            (0, vitest_1.expect)(result).toContain('export const newChat: ActionHandler');
            (0, vitest_1.expect)(result).toContain('TODO');
        });
    });
    (0, vitest_1.describe)('generateActionsIndex', () => {
        (0, vitest_1.it)('should import and re-export all actions', () => {
            const result = (0, templates_js_1.generateActionsIndex)(mockGeminiDef.actions);
            (0, vitest_1.expect)(result).toContain("import { sendMessage } from './send-message.js'");
            (0, vitest_1.expect)(result).toContain("import { newChat } from './new-chat.js'");
            (0, vitest_1.expect)(result).toContain('export const actions');
            (0, vitest_1.expect)(result).toContain('sendMessage,');
            (0, vitest_1.expect)(result).toContain('newChat,');
        });
    });
    (0, vitest_1.describe)('generateMainIndex', () => {
        (0, vitest_1.it)('should reference defineSite, createShimApp, and all imported modules', () => {
            const result = (0, templates_js_1.generateMainIndex)('gemini', 'https://gemini.google.com', mockGeminiDef.actions);
            (0, vitest_1.expect)(result).toContain("import { defineSite, createShimApp } from '@pingdev/core'");
            (0, vitest_1.expect)(result).toContain("import { selectors } from './selectors.js'");
            (0, vitest_1.expect)(result).toContain("import { stateConfig } from './states.js'");
            (0, vitest_1.expect)(result).toContain("import { actions } from './actions/index.js'");
            (0, vitest_1.expect)(result).toContain("name: 'gemini'");
            (0, vitest_1.expect)(result).toContain("url: 'https://gemini.google.com'");
            (0, vitest_1.expect)(result).toContain('app.start()');
        });
        (0, vitest_1.it)('should map known actions and provide placeholders for required slots', () => {
            const result = (0, templates_js_1.generateMainIndex)('gemini', 'https://gemini.google.com', mockGeminiDef.actions);
            // Required slots that aren't in mock actions should get placeholders
            (0, vitest_1.expect)(result).toContain('findOrCreatePage');
            (0, vitest_1.expect)(result).toContain('typePrompt');
            (0, vitest_1.expect)(result).toContain('submit');
            (0, vitest_1.expect)(result).toContain('isGenerating');
            (0, vitest_1.expect)(result).toContain('isResponseComplete');
            (0, vitest_1.expect)(result).toContain('extractResponse');
        });
    });
    (0, vitest_1.describe)('generateTestFile', () => {
        (0, vitest_1.it)('should generate test skeletons for each action', () => {
            const result = (0, templates_js_1.generateTestFile)('gemini', mockGeminiDef.actions);
            (0, vitest_1.expect)(result).toContain("describe('gemini PingApp'");
            (0, vitest_1.expect)(result).toContain("describe('sendMessage'");
            (0, vitest_1.expect)(result).toContain("describe('newChat'");
            (0, vitest_1.expect)(result).toContain('should be defined');
        });
    });
    (0, vitest_1.describe)('generateReadme', () => {
        (0, vitest_1.it)('should include site info, actions, states, and selectors', () => {
            const result = (0, templates_js_1.generateReadme)(mockGeminiDef);
            (0, vitest_1.expect)(result).toContain('# PingApp: gemini');
            (0, vitest_1.expect)(result).toContain('https://gemini.google.com');
            (0, vitest_1.expect)(result).toContain('**Category:** chat');
            (0, vitest_1.expect)(result).toContain('**sendMessage**');
            (0, vitest_1.expect)(result).toContain('(primary)');
            (0, vitest_1.expect)(result).toContain('**newChat**');
            (0, vitest_1.expect)(result).toContain('**idle**');
            (0, vitest_1.expect)(result).toContain('**chat-input**');
        });
    });
});
(0, vitest_1.describe)('PingAppGenerator', () => {
    const generator = new generator_js_1.PingAppGenerator();
    const config = {
        outputDir: '/tmp/test-pingapp',
        siteDefinition: mockGeminiDef,
        selfTest: false,
        maxRetries: 0,
    };
    (0, vitest_1.describe)('preview', () => {
        (0, vitest_1.it)('should return a file map without writing to disk', () => {
            const files = generator.preview(config);
            (0, vitest_1.expect)(files).toBeInstanceOf(Map);
            (0, vitest_1.expect)(files.size).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('should include all expected files', () => {
            const files = generator.preview(config);
            const paths = [...files.keys()];
            (0, vitest_1.expect)(paths).toContain('package.json');
            (0, vitest_1.expect)(paths).toContain('tsconfig.json');
            (0, vitest_1.expect)(paths).toContain('src/selectors.ts');
            (0, vitest_1.expect)(paths).toContain('src/states.ts');
            (0, vitest_1.expect)(paths).toContain('src/actions/index.ts');
            (0, vitest_1.expect)(paths).toContain('src/actions/send-message.ts');
            (0, vitest_1.expect)(paths).toContain('src/actions/new-chat.ts');
            (0, vitest_1.expect)(paths).toContain('src/index.ts');
            (0, vitest_1.expect)(paths).toContain('tests/actions.test.ts');
            (0, vitest_1.expect)(paths).toContain('README.md');
        });
        (0, vitest_1.it)('should generate valid package.json', () => {
            const files = generator.preview(config);
            const pkgJson = JSON.parse(files.get('package.json'));
            (0, vitest_1.expect)(pkgJson.name).toBe('@pingapps/gemini');
            (0, vitest_1.expect)(pkgJson.dependencies['@pingdev/core']).toBeDefined();
        });
        (0, vitest_1.it)('should generate selectors.ts with correct format', () => {
            const files = generator.preview(config);
            const selectors = files.get('src/selectors.ts');
            (0, vitest_1.expect)(selectors).toContain("import type { SelectorDef } from '@pingdev/core'");
            (0, vitest_1.expect)(selectors).toContain("'chat-input'");
            (0, vitest_1.expect)(selectors).toContain('tiers: [');
        });
        (0, vitest_1.it)('should generate index.ts that references all actions', () => {
            const files = generator.preview(config);
            const index = files.get('src/index.ts');
            (0, vitest_1.expect)(index).toContain("import { actions } from './actions/index.js'");
            (0, vitest_1.expect)(index).toContain('defineSite');
            (0, vitest_1.expect)(index).toContain('createShimApp');
        });
        (0, vitest_1.it)('should create one action file per inferred action', () => {
            const files = generator.preview(config);
            const actionFiles = [...files.keys()].filter((p) => p.startsWith('src/actions/') && p !== 'src/actions/index.ts');
            (0, vitest_1.expect)(actionFiles).toHaveLength(mockGeminiDef.actions.length);
        });
    });
});
//# sourceMappingURL=generator.test.js.map