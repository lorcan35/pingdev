import { describe, it, expect } from 'vitest';
import { defineSite } from '../src/site.js';
import type { SiteDefinition, ActionContext } from '../src/types.js';

const mockAction = async (_ctx: ActionContext) => {};

const minimalSite: SiteDefinition = {
  name: 'test-site',
  url: 'https://example.com',
  selectors: {},
  states: {
    transitions: { IDLE: ['TYPING'], TYPING: ['DONE'], DONE: ['IDLE'] },
  },
  actions: {
    findOrCreatePage: mockAction,
    typePrompt: mockAction,
    submit: mockAction,
    isGenerating: mockAction,
    isResponseComplete: mockAction,
    extractResponse: mockAction,
  },
  completion: {
    method: 'hash_stability',
    pollMs: 1000,
    stableCount: 3,
    maxWaitMs: 60_000,
  },
};

describe('defineSite', () => {
  it('returns site definition with provided config', () => {
    const site = defineSite(minimalSite);
    expect(site.name).toBe('test-site');
    expect(site.url).toBe('https://example.com');
  });

  it('throws if name is missing', () => {
    expect(() => defineSite({ ...minimalSite, name: '' })).toThrow('Site name is required');
  });

  it('throws if url is missing', () => {
    expect(() => defineSite({ ...minimalSite, url: '' })).toThrow('Site URL is required');
  });

  it('throws if required actions are missing', () => {
    const site = { ...minimalSite, actions: { ...minimalSite.actions, typePrompt: undefined as any } };
    expect(() => defineSite(site)).toThrow('actions.typePrompt is required');
  });

  it('applies default completion config when not provided', () => {
    const siteWithoutCompletion = { ...minimalSite, completion: undefined as any };
    const site = defineSite(siteWithoutCompletion);
    expect(site.completion).toBeDefined();
    expect(site.completion.method).toBe('hash_stability');
    expect(site.completion.stableCount).toBe(3);
  });

  it('applies default state machine config when not provided', () => {
    const siteWithoutStates = { ...minimalSite, states: undefined as any };
    const site = defineSite(siteWithoutStates);
    expect(site.states).toBeDefined();
    expect(site.states.transitions['IDLE']).toContain('TYPING');
  });
});
