import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';
import type { SiteDefinition, ActionContext } from '../src/types.js';

const mockAction = async (_ctx: ActionContext) => {};

const minimalSite: SiteDefinition = {
  name: 'test',
  url: 'https://example.com',
  selectors: {},
  states: { transitions: {} },
  actions: {
    findOrCreatePage: mockAction,
    typePrompt: mockAction,
    submit: mockAction,
    isGenerating: mockAction,
    isResponseComplete: mockAction,
    extractResponse: mockAction,
  },
  completion: { method: 'hash_stability', pollMs: 1000, stableCount: 3, maxWaitMs: 60_000 },
};

describe('resolveConfig', () => {
  it('applies default browser config', () => {
    const config = resolveConfig(minimalSite);
    expect(config.browser.cdpUrl).toBe('http://127.0.0.1:9222');
    expect(config.browser.connectTimeoutMs).toBe(15_000);
  });

  it('applies default redis config', () => {
    const config = resolveConfig(minimalSite);
    expect(config.redis.host).toBe('127.0.0.1');
    expect(config.redis.port).toBe(6379);
  });

  it('uses site name in queue name', () => {
    const config = resolveConfig(minimalSite);
    expect(config.queue.name).toBe('test-jobs');
  });

  it('uses site name in key prefixes', () => {
    const config = resolveConfig(minimalSite);
    expect(config.idempotency.keyPrefix).toBe('test-idemp');
    expect(config.conversation.keyPrefix).toBe('test-convo');
  });

  it('allows overriding defaults', () => {
    const config = resolveConfig({
      ...minimalSite,
      redis: { host: 'redis.local', port: 6380 },
      rateLimit: { maxPerMinute: 20, minDelayMs: 1000, maxQueueDepth: 50 },
    });
    expect(config.redis.host).toBe('redis.local');
    expect(config.redis.port).toBe(6380);
    expect(config.rateLimit.maxPerMinute).toBe(20);
  });

  it('defaults artifactsDir to ./artifacts', () => {
    const config = resolveConfig(minimalSite);
    expect(config.artifactsDir).toBe('./artifacts');
  });
});
