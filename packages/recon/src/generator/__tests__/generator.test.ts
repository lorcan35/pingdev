import { describe, it, expect } from 'vitest';
import type { SiteDefinitionResult, GeneratorConfig } from '../../types.js';

const mockGeminiDef: SiteDefinitionResult = {
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

describe('templates', () => {
  it('should generate valid package.json', async () => {
    const { generatePackageJson } = await import('../templates.js');
    const json = generatePackageJson('gemini', 'https://gemini.google.com');
    const pkg = JSON.parse(json);
    expect(pkg.name).toBe('@pingapps/gemini');
    expect(pkg.dependencies['@pingdev/core']).toBe('^0.1.0');
    expect(pkg.scripts.build).toBe('tsc');
  });

  it('should generate valid tsconfig.json', async () => {
    const { generateTsConfig } = await import('../templates.js');
    const json = generateTsConfig();
    const config = JSON.parse(json);
    expect(config.compilerOptions.target).toBe('ES2022');
    expect(config.compilerOptions.module).toBe('Node16');
  });

  it('should generate selectors.ts with proper format', async () => {
    const { generateSelectors } = await import('../templates.js');
    const source = generateSelectors(mockGeminiDef.selectors);

    expect(source).toContain("import type { SelectorDef } from '@pingdev/core'");
    expect(source).toContain("'chat-input'");
    expect(source).toContain("'submit-btn'");
    expect(source).toContain("'response-area'");
    expect(source).toContain('tiers:');
    expect(source).toContain('[contenteditable="true"]');
  });

  it('should generate states.ts with transitions', async () => {
    const { generateStates } = await import('../templates.js');
    const source = generateStates(mockGeminiDef.stateTransitions);

    expect(source).toContain("import type { StateMachineConfig } from '@pingdev/core'");
    expect(source).toContain("'IDLE'");
    expect(source).toContain("'TYPING'");
    expect(source).toContain("'GENERATING'");
    expect(source).toContain("initialState: 'IDLE'");
  });

  it('should generate action file with selectors', async () => {
    const { generateActionFile } = await import('../templates.js');
    const source = generateActionFile(mockGeminiDef.actions[0], mockGeminiDef.selectors);

    expect(source).toContain("import type { ActionHandler } from '@pingdev/core'");
    expect(source).toContain('export const sendMessage: ActionHandler');
    expect(source).toContain("selectors['chat-input']");
    expect(source).toContain("selectors['submit-btn']");
    expect(source).toContain("selectors['response-area']");
  });

  it('should generate action file with placeholder for no-selector actions', async () => {
    const { generateActionFile } = await import('../templates.js');
    const source = generateActionFile(mockGeminiDef.actions[1], mockGeminiDef.selectors);

    expect(source).toContain('export const newChat: ActionHandler');
    expect(source).toContain('TODO');
  });

  it('should generate actions barrel export', async () => {
    const { generateActionsIndex } = await import('../templates.js');
    const source = generateActionsIndex(mockGeminiDef.actions);

    expect(source).toContain("import { sendMessage } from './send-message.js'");
    expect(source).toContain("import { newChat } from './new-chat.js'");
    expect(source).toContain('export const actions');
    expect(source).toContain('sendMessage,');
    expect(source).toContain('newChat,');
  });

  it('should generate main index.ts with defineSite', async () => {
    const { generateMainIndex } = await import('../templates.js');
    const source = generateMainIndex('gemini', 'https://gemini.google.com', mockGeminiDef.actions);

    expect(source).toContain("import { defineSite, createShimApp } from '@pingdev/core'");
    expect(source).toContain("name: 'gemini'");
    expect(source).toContain("url: 'https://gemini.google.com'");
    expect(source).toContain('const app = createShimApp(site)');
  });

  it('should generate test file', async () => {
    const { generateTestFile } = await import('../templates.js');
    const source = generateTestFile('gemini', mockGeminiDef.actions);

    expect(source).toContain("describe('gemini PingApp'");
    expect(source).toContain("describe('sendMessage'");
    expect(source).toContain("describe('newChat'");
    expect(source).toContain('should be defined');
  });

  it('should generate README.md', async () => {
    const { generateReadme } = await import('../templates.js');
    const readme = generateReadme(mockGeminiDef);

    expect(readme).toContain('# PingApp: gemini');
    expect(readme).toContain('**Category:** chat');
    expect(readme).toContain('sendMessage');
    expect(readme).toContain('npm install');
  });
});

describe('PingAppGenerator', () => {
  it('should preview all expected files', async () => {
    const { PingAppGenerator } = await import('../generator.js');
    const generator = new PingAppGenerator();

    const config: GeneratorConfig = {
      outputDir: '/tmp/test-pingapp',
      siteDefinition: mockGeminiDef,
      selfTest: false,
      maxRetries: 0,
    };

    const files = generator.preview(config);

    expect(files.has('package.json')).toBe(true);
    expect(files.has('tsconfig.json')).toBe(true);
    expect(files.has('src/selectors.ts')).toBe(true);
    expect(files.has('src/states.ts')).toBe(true);
    expect(files.has('src/index.ts')).toBe(true);
    expect(files.has('src/actions/index.ts')).toBe(true);
    expect(files.has('src/actions/send-message.ts')).toBe(true);
    expect(files.has('src/actions/new-chat.ts')).toBe(true);
    expect(files.has('tests/actions.test.ts')).toBe(true);
    expect(files.has('README.md')).toBe(true);

    // Verify file count: pkg + tsconfig + selectors + states + index + actions-index + 2 actions + test + readme
    expect(files.size).toBe(10);
  });

  it('should generate parseable package.json', async () => {
    const { PingAppGenerator } = await import('../generator.js');
    const generator = new PingAppGenerator();

    const files = generator.preview({
      outputDir: '/tmp/test',
      siteDefinition: mockGeminiDef,
      selfTest: false,
      maxRetries: 0,
    });

    const pkg = JSON.parse(files.get('package.json')!);
    expect(pkg.name).toBe('@pingapps/gemini');
    expect(pkg.dependencies['@pingdev/core']).toBeDefined();
  });
});
