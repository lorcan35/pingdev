import { describe, it, expect } from 'vitest';
import type { SiteDefinitionResult } from '../src/types.js';
import { PingAppGenerator } from '../src/generator/generator.js';
import {
  generatePackageJson,
  generateTsConfig,
  generateSelectors,
  generateStates,
  generateActionFile,
  generateActionsIndex,
  generateMainIndex,
  generateTestFile,
  generateReadme,
} from '../src/generator/templates.js';

const mockGeminiDef: SiteDefinitionResult = {
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

describe('templates', () => {
  describe('generatePackageJson', () => {
    it('should produce valid JSON with correct name and deps', () => {
      const result = generatePackageJson('gemini', 'https://gemini.google.com');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('@pingapps/gemini');
      expect(parsed.dependencies['@pingdev/core']).toBe('^0.1.0');
      expect(parsed.type).toBe('commonjs');
      expect(parsed.scripts.build).toBe('tsc');
    });
  });

  describe('generateTsConfig', () => {
    it('should produce valid JSON with Node16 module settings', () => {
      const result = generateTsConfig();
      const parsed = JSON.parse(result);
      expect(parsed.compilerOptions.module).toBe('Node16');
      expect(parsed.compilerOptions.moduleResolution).toBe('Node16');
      expect(parsed.compilerOptions.target).toBe('ES2022');
      expect(parsed.compilerOptions.strict).toBe(true);
    });
  });

  describe('generateSelectors', () => {
    it('should produce TypeScript source with SelectorDef imports and all selectors', () => {
      const result = generateSelectors(mockGeminiDef.selectors);
      expect(result).toContain("import type { SelectorDef } from '@pingdev/core'");
      expect(result).toContain("'chat-input'");
      expect(result).toContain("'submit-btn'");
      expect(result).toContain("'response-area'");
      expect(result).toContain('[data-testid="chat-input"]');
      expect(result).toContain('.ql-editor');
    });

    it('should have correct structure with tiers arrays', () => {
      const result = generateSelectors(mockGeminiDef.selectors);
      expect(result).toContain('tiers: [');
      expect(result).toContain("name: 'chat-input'");
    });
  });

  describe('generateStates', () => {
    it('should produce StateMachineConfig source with all transitions', () => {
      const result = generateStates(mockGeminiDef.stateTransitions);
      expect(result).toContain("import type { StateMachineConfig } from '@pingdev/core'");
      expect(result).toContain("'IDLE': ['TYPING']");
      expect(result).toContain("'GENERATING': ['DONE', 'FAILED']");
      expect(result).toContain("initialState: 'IDLE'");
    });
  });

  describe('generateActionFile', () => {
    it('should generate an action with input, submit, and output selectors', () => {
      const result = generateActionFile(mockGeminiDef.actions[0], mockGeminiDef.selectors);
      expect(result).toContain("import type { ActionHandler } from '@pingdev/core'");
      expect(result).toContain("import { selectors } from '../selectors.js'");
      expect(result).toContain('export const sendMessage: ActionHandler');
      expect(result).toContain("selectors['chat-input']");
      expect(result).toContain("selectors['submit-btn']");
      expect(result).toContain("selectors['response-area']");
      expect(result).toContain('input.fill(ctx.jobRequest.prompt)');
      expect(result).toContain('trigger.click()');
      expect(result).toContain('output.textContent()');
    });

    it('should generate a placeholder for actions without selectors', () => {
      const result = generateActionFile(mockGeminiDef.actions[1], mockGeminiDef.selectors);
      expect(result).toContain('export const newChat: ActionHandler');
      expect(result).toContain('TODO');
    });
  });

  describe('generateActionsIndex', () => {
    it('should import and re-export all actions', () => {
      const result = generateActionsIndex(mockGeminiDef.actions);
      expect(result).toContain("import { sendMessage } from './send-message.js'");
      expect(result).toContain("import { newChat } from './new-chat.js'");
      expect(result).toContain('export const actions');
      expect(result).toContain('sendMessage,');
      expect(result).toContain('newChat,');
    });
  });

  describe('generateMainIndex', () => {
    it('should reference defineSite, createShimApp, and all imported modules', () => {
      const result = generateMainIndex('gemini', 'https://gemini.google.com', mockGeminiDef.actions);
      expect(result).toContain("import { defineSite, createShimApp } from '@pingdev/core'");
      expect(result).toContain("import { selectors } from './selectors.js'");
      expect(result).toContain("import { stateConfig } from './states.js'");
      expect(result).toContain("import { actions } from './actions/index.js'");
      expect(result).toContain("name: 'gemini'");
      expect(result).toContain("url: 'https://gemini.google.com'");
      expect(result).toContain('app.start()');
    });

    it('should map known actions and provide placeholders for required slots', () => {
      const result = generateMainIndex('gemini', 'https://gemini.google.com', mockGeminiDef.actions);
      // Required slots that aren't in mock actions should get placeholders
      expect(result).toContain('findOrCreatePage');
      expect(result).toContain('typePrompt');
      expect(result).toContain('submit');
      expect(result).toContain('isGenerating');
      expect(result).toContain('isResponseComplete');
      expect(result).toContain('extractResponse');
    });
  });

  describe('generateTestFile', () => {
    it('should generate test skeletons for each action', () => {
      const result = generateTestFile('gemini', mockGeminiDef.actions);
      expect(result).toContain("describe('gemini PingApp'");
      expect(result).toContain("describe('sendMessage'");
      expect(result).toContain("describe('newChat'");
      expect(result).toContain('should be defined');
    });
  });

  describe('generateReadme', () => {
    it('should include site info, actions, states, and selectors', () => {
      const result = generateReadme(mockGeminiDef);
      expect(result).toContain('# PingApp: gemini');
      expect(result).toContain('https://gemini.google.com');
      expect(result).toContain('**Category:** chat');
      expect(result).toContain('**sendMessage**');
      expect(result).toContain('(primary)');
      expect(result).toContain('**newChat**');
      expect(result).toContain('**idle**');
      expect(result).toContain('**chat-input**');
    });
  });
});

describe('PingAppGenerator', () => {
  const generator = new PingAppGenerator();
  const config = {
    outputDir: '/tmp/test-pingapp',
    siteDefinition: mockGeminiDef,
    selfTest: false,
    maxRetries: 0,
  };

  describe('preview', () => {
    it('should return a file map without writing to disk', () => {
      const files = generator.preview(config);
      expect(files).toBeInstanceOf(Map);
      expect(files.size).toBeGreaterThan(0);
    });

    it('should include all expected files', () => {
      const files = generator.preview(config);
      const paths = [...files.keys()];
      expect(paths).toContain('package.json');
      expect(paths).toContain('tsconfig.json');
      expect(paths).toContain('src/selectors.ts');
      expect(paths).toContain('src/states.ts');
      expect(paths).toContain('src/actions/index.ts');
      expect(paths).toContain('src/actions/send-message.ts');
      expect(paths).toContain('src/actions/new-chat.ts');
      expect(paths).toContain('src/index.ts');
      expect(paths).toContain('tests/actions.test.ts');
      expect(paths).toContain('README.md');
    });

    it('should generate valid package.json', () => {
      const files = generator.preview(config);
      const pkgJson = JSON.parse(files.get('package.json')!);
      expect(pkgJson.name).toBe('@pingapps/gemini');
      expect(pkgJson.dependencies['@pingdev/core']).toBeDefined();
    });

    it('should generate selectors.ts with correct format', () => {
      const files = generator.preview(config);
      const selectors = files.get('src/selectors.ts')!;
      expect(selectors).toContain("import type { SelectorDef } from '@pingdev/core'");
      expect(selectors).toContain("'chat-input'");
      expect(selectors).toContain('tiers: [');
    });

    it('should generate index.ts that references all actions', () => {
      const files = generator.preview(config);
      const index = files.get('src/index.ts')!;
      expect(index).toContain("import { actions } from './actions/index.js'");
      expect(index).toContain('defineSite');
      expect(index).toContain('createShimApp');
    });

    it('should create one action file per inferred action', () => {
      const files = generator.preview(config);
      const actionFiles = [...files.keys()].filter(
        (p) => p.startsWith('src/actions/') && p !== 'src/actions/index.ts',
      );
      expect(actionFiles).toHaveLength(mockGeminiDef.actions.length);
    });
  });
});
