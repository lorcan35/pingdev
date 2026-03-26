import { defineSite, createShimApp } from '@pingdev/core';
import { selectors } from './selectors.js';
import { stateConfig } from './states.js';
import { actions } from './actions/index.js';

const site = defineSite({
  name: 'aliexpress',
  url: 'https://www.aliexpress.com',
  selectors,
  states: stateConfig,
  actions: {
    findOrCreatePage: async (ctx) => { ctx.log.warn('findOrCreatePage not implemented'); },
    typePrompt: async (ctx) => { ctx.log.warn('typePrompt not implemented'); },
    submit: async (ctx) => { ctx.log.warn('submit not implemented'); },
    isGenerating: async (ctx) => { ctx.log.warn('isGenerating not implemented'); },
    isResponseComplete: async (ctx) => { ctx.log.warn('isResponseComplete not implemented'); },
    extractResponse: async (ctx) => { ctx.log.warn('extractResponse not implemented'); },
  },
  completion: { method: 'hash_stability', pollMs: 750, stableCount: 3, maxWaitMs: 120000 },
});

const app = createShimApp(site);
app.start().then(() => console.log('PingApp running'));
