import { describe, it, expect } from 'vitest';

describe('aistudio PingApp', () => {
  describe('site definition', () => {
    it('should export a valid site definition', async () => {
      const { aistudioSite } = await import('../src/index.js');
      expect(aistudioSite).toBeDefined();
      expect(aistudioSite.name).toBe('aistudio');
      expect(aistudioSite.url).toContain('aistudio.google.com');
    });

    it('should have all required action handlers', async () => {
      const { aistudioSite } = await import('../src/index.js');
      expect(aistudioSite.actions.findOrCreatePage).toBeTypeOf('function');
      expect(aistudioSite.actions.typePrompt).toBeTypeOf('function');
      expect(aistudioSite.actions.submit).toBeTypeOf('function');
      expect(aistudioSite.actions.isGenerating).toBeTypeOf('function');
      expect(aistudioSite.actions.isResponseComplete).toBeTypeOf('function');
      expect(aistudioSite.actions.extractResponse).toBeTypeOf('function');
    });

    it('should have optional action handlers', async () => {
      const { aistudioSite } = await import('../src/index.js');
      expect(aistudioSite.actions.preflight).toBeTypeOf('function');
      expect(aistudioSite.actions.extractPartialResponse).toBeTypeOf('function');
      expect(aistudioSite.actions.extractThinking).toBeTypeOf('function');
      expect(aistudioSite.actions.dismissOverlays).toBeTypeOf('function');
      expect(aistudioSite.actions.newConversation).toBeTypeOf('function');
      expect(aistudioSite.actions.getCurrentUrl).toBeTypeOf('function');
    });

    it('should have correct completion config', async () => {
      const { aistudioSite } = await import('../src/index.js');
      expect(aistudioSite.completion.method).toBe('hash_stability');
      expect(aistudioSite.completion.pollMs).toBe(1000);
      expect(aistudioSite.completion.stableCount).toBe(3);
      expect(aistudioSite.completion.maxWaitMs).toBe(120_000);
    });

    it('should have correct browser config', async () => {
      const { aistudioSite } = await import('../src/index.js');
      expect(aistudioSite.browser?.cdpUrl).toBe('http://127.0.0.1:18800');
    });
  });

  describe('selectors', () => {
    it('should export selectors with tiered fallbacks', async () => {
      const { selectors } = await import('../src/selectors.js');
      expect(selectors['chat-input']).toBeDefined();
      expect(selectors['chat-input'].tiers.length).toBeGreaterThan(0);
      expect(selectors['submit-button']).toBeDefined();
      expect(selectors['stop-button']).toBeDefined();
      expect(selectors['response-container']).toBeDefined();
    });
  });

  describe('auxiliary actions', () => {
    it('sendMessage should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['sendMessage']).toBeDefined();
    });

    it('newConversation should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['newConversation']).toBeDefined();
    });

    it('switchModel should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['switchModel']).toBeDefined();
    });

    it('toggleTool should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['toggleTool']).toBeDefined();
    });

    it('stopGeneration should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['stopGeneration']).toBeDefined();
    });

    it('setThinkingLevel should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['setThinkingLevel']).toBeDefined();
    });

    it('setTemperature should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['setTemperature']).toBeDefined();
    });
  });

  describe('state config', () => {
    it('should have uppercase state transitions', async () => {
      const { stateConfig } = await import('../src/states.js');
      expect(stateConfig.transitions['IDLE']).toBeDefined();
      expect(stateConfig.transitions['TYPING']).toBeDefined();
      expect(stateConfig.transitions['GENERATING']).toBeDefined();
      expect(stateConfig.transitions['DONE']).toBeDefined();
      expect(stateConfig.transitions['FAILED']).toBeDefined();
      expect(stateConfig.initialState).toBe('IDLE');
    });
  });
});
