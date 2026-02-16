"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mockGeminiDef = {
    name: 'gemini',
    url: 'https://gemini.google.com',
    purpose: 'AI chat assistant',
    category: 'chat',
    selectors: {
        'chat-input': { name: 'chat-input', tiers: ['[contenteditable="true"]', '.ql-editor'] },
        'submit-btn': { name: 'submit-btn', tiers: ['button[aria-label="Send message"]', '.send-button'] },
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
    (0, vitest_1.it)('should generate valid package.json', async () => {
        const { generatePackageJson } = await import('../templates.js');
        const json = generatePackageJson('gemini', 'https://gemini.google.com');
        const pkg = JSON.parse(json);
        (0, vitest_1.expect)(pkg.name).toBe('@pingapps/gemini');
        (0, vitest_1.expect)(pkg.dependencies['@pingdev/core']).toBe('^0.1.0');
        (0, vitest_1.expect)(pkg.scripts.build).toBe('tsc');
    });
    (0, vitest_1.it)('should generate valid tsconfig.json', async () => {
        const { generateTsConfig } = await import('../templates.js');
        const json = generateTsConfig();
        const config = JSON.parse(json);
        (0, vitest_1.expect)(config.compilerOptions.target).toBe('ES2022');
        (0, vitest_1.expect)(config.compilerOptions.module).toBe('Node16');
    });
    (0, vitest_1.it)('should generate selectors.ts with proper format', async () => {
        const { generateSelectors } = await import('../templates.js');
        const source = generateSelectors(mockGeminiDef.selectors);
        (0, vitest_1.expect)(source).toContain("import type { SelectorDef } from '@pingdev/core'");
        (0, vitest_1.expect)(source).toContain("'chat-input'");
        (0, vitest_1.expect)(source).toContain("'submit-btn'");
        (0, vitest_1.expect)(source).toContain("'response-area'");
        (0, vitest_1.expect)(source).toContain('tiers:');
        (0, vitest_1.expect)(source).toContain('[contenteditable="true"]');
    });
    (0, vitest_1.it)('should generate states.ts with transitions', async () => {
        const { generateStates } = await import('../templates.js');
        const source = generateStates(mockGeminiDef.stateTransitions);
        (0, vitest_1.expect)(source).toContain("import type { StateMachineConfig } from '@pingdev/core'");
        (0, vitest_1.expect)(source).toContain("'IDLE'");
        (0, vitest_1.expect)(source).toContain("'TYPING'");
        (0, vitest_1.expect)(source).toContain("'GENERATING'");
        (0, vitest_1.expect)(source).toContain("initialState: 'IDLE'");
    });
    (0, vitest_1.it)('should generate action file with selectors', async () => {
        const { generateActionFile } = await import('../templates.js');
        const source = generateActionFile(mockGeminiDef.actions[0], mockGeminiDef.selectors);
        (0, vitest_1.expect)(source).toContain("import type { ActionHandler } from '@pingdev/core'");
        (0, vitest_1.expect)(source).toContain('export const sendMessage: ActionHandler');
        (0, vitest_1.expect)(source).toContain("selectors['chat-input']");
        (0, vitest_1.expect)(source).toContain("selectors['submit-btn']");
        (0, vitest_1.expect)(source).toContain("selectors['response-area']");
    });
    (0, vitest_1.it)('should generate action file with placeholder for no-selector actions', async () => {
        const { generateActionFile } = await import('../templates.js');
        const source = generateActionFile(mockGeminiDef.actions[1], mockGeminiDef.selectors);
        (0, vitest_1.expect)(source).toContain('export const newChat: ActionHandler');
        (0, vitest_1.expect)(source).toContain('TODO');
    });
    (0, vitest_1.it)('should generate actions barrel export', async () => {
        const { generateActionsIndex } = await import('../templates.js');
        const source = generateActionsIndex(mockGeminiDef.actions);
        (0, vitest_1.expect)(source).toContain("import { sendMessage } from './send-message.js'");
        (0, vitest_1.expect)(source).toContain("import { newChat } from './new-chat.js'");
        (0, vitest_1.expect)(source).toContain('export const actions');
        (0, vitest_1.expect)(source).toContain('sendMessage,');
        (0, vitest_1.expect)(source).toContain('newChat,');
    });
    (0, vitest_1.it)('should generate main index.ts with defineSite', async () => {
        const { generateMainIndex } = await import('../templates.js');
        const source = generateMainIndex('gemini', 'https://gemini.google.com', mockGeminiDef.actions);
        (0, vitest_1.expect)(source).toContain("import { defineSite, createShimApp } from '@pingdev/core'");
        (0, vitest_1.expect)(source).toContain("name: 'gemini'");
        (0, vitest_1.expect)(source).toContain("url: 'https://gemini.google.com'");
        (0, vitest_1.expect)(source).toContain('const app = createShimApp(site)');
    });
    (0, vitest_1.it)('should generate test file', async () => {
        const { generateTestFile } = await import('../templates.js');
        const source = generateTestFile('gemini', mockGeminiDef.actions);
        (0, vitest_1.expect)(source).toContain("describe('gemini PingApp'");
        (0, vitest_1.expect)(source).toContain("describe('sendMessage'");
        (0, vitest_1.expect)(source).toContain("describe('newChat'");
        (0, vitest_1.expect)(source).toContain('should be defined');
    });
    (0, vitest_1.it)('should generate README.md', async () => {
        const { generateReadme } = await import('../templates.js');
        const readme = generateReadme(mockGeminiDef);
        (0, vitest_1.expect)(readme).toContain('# PingApp: gemini');
        (0, vitest_1.expect)(readme).toContain('**Category:** chat');
        (0, vitest_1.expect)(readme).toContain('sendMessage');
        (0, vitest_1.expect)(readme).toContain('npm install');
    });
});
(0, vitest_1.describe)('PingAppGenerator', () => {
    (0, vitest_1.it)('should preview all expected files', async () => {
        const { PingAppGenerator } = await import('../generator.js');
        const generator = new PingAppGenerator();
        const config = {
            outputDir: '/tmp/test-pingapp',
            siteDefinition: mockGeminiDef,
            selfTest: false,
            maxRetries: 0,
        };
        const files = generator.preview(config);
        (0, vitest_1.expect)(files.has('package.json')).toBe(true);
        (0, vitest_1.expect)(files.has('tsconfig.json')).toBe(true);
        (0, vitest_1.expect)(files.has('src/selectors.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('src/states.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('src/index.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('src/actions/index.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('src/actions/send-message.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('src/actions/new-chat.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('tests/actions.test.ts')).toBe(true);
        (0, vitest_1.expect)(files.has('README.md')).toBe(true);
        // Verify file count: pkg + tsconfig + selectors + states + index + actions-index + 2 actions + test + readme
        (0, vitest_1.expect)(files.size).toBe(10);
    });
    (0, vitest_1.it)('should generate parseable package.json', async () => {
        const { PingAppGenerator } = await import('../generator.js');
        const generator = new PingAppGenerator();
        const files = generator.preview({
            outputDir: '/tmp/test',
            siteDefinition: mockGeminiDef,
            selfTest: false,
            maxRetries: 0,
        });
        const pkg = JSON.parse(files.get('package.json'));
        (0, vitest_1.expect)(pkg.name).toBe('@pingapps/gemini');
        (0, vitest_1.expect)(pkg.dependencies['@pingdev/core']).toBeDefined();
    });
});
//# sourceMappingURL=generator.test.js.map