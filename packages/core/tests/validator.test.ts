import { describe, it, expect, vi } from 'vitest';
import { PingAppLoader } from '../src/validator/loader.js';
import { ActionValidator } from '../src/validator/validator.js';
import type {
  ActionValidationResult,
  ValidationReport,
  PingAppConfig,
} from '../src/validator/types.js';

const CHATGPT_APP_DIR = process.env['HOME'] + '/projects/pingapps/chatgpt';

describe('PingAppLoader', () => {
  it('loads the ChatGPT PingApp selectors', () => {
    const loader = new PingAppLoader(CHATGPT_APP_DIR);
    const selectors = loader.parseSelectors();

    expect(Object.keys(selectors).length).toBeGreaterThan(0);
    expect(selectors['promptInput']).toBeDefined();
    expect(selectors['promptInput']!.name).toBe('promptInput');
    expect(selectors['promptInput']!.tiers.length).toBeGreaterThan(0);
    expect(selectors['messageOutput']).toBeDefined();
  });

  it('loads the ChatGPT PingApp state config', () => {
    const loader = new PingAppLoader(CHATGPT_APP_DIR);
    const states = loader.parseStates();

    expect(states.initialState).toBe('IDLE');
    expect(states.transitions).toBeDefined();
    expect(Object.keys(states.transitions).length).toBeGreaterThan(0);
  });

  it('loads site name and URL from index.ts', () => {
    const loader = new PingAppLoader(CHATGPT_APP_DIR);
    const { name, url } = loader.parseSiteInfo();

    expect(name).toBe('chatgpt');
    expect(url).toBe('https://chatgpt.com');
  });

  it('load() returns a full PingAppConfig', () => {
    const loader = new PingAppLoader(CHATGPT_APP_DIR);
    const config: PingAppConfig = loader.load();

    expect(config.name).toBe('chatgpt');
    expect(config.url).toBe('https://chatgpt.com');
    expect(Object.keys(config.selectors).length).toBeGreaterThan(5);
    expect(config.states.transitions).toBeDefined();
  });

  it('throws on invalid app directory', () => {
    const loader = new PingAppLoader('/nonexistent/path');
    expect(() => loader.load()).toThrow('Cannot read PingApp file');
  });
});

describe('ValidationReport', () => {
  it('creates a valid report structure', () => {
    const results: ActionValidationResult[] = [
      { actionName: 'connect', passed: true, timing_ms: 100 },
      { actionName: 'findOrCreatePage', passed: true, timing_ms: 200 },
      { actionName: 'typePrompt', passed: false, error: 'Selector not found', timing_ms: 5000 },
    ];

    const report: ValidationReport = {
      appName: 'chatgpt',
      url: 'https://chatgpt.com',
      timestamp: new Date().toISOString(),
      results,
      overallPassed: results.every((r) => r.passed),
      duration_ms: 5300,
    };

    expect(report.overallPassed).toBe(false);
    expect(report.results).toHaveLength(3);
    expect(report.results[2]!.error).toBe('Selector not found');
  });

  it('overallPassed is true when all pass', () => {
    const results: ActionValidationResult[] = [
      { actionName: 'connect', passed: true, timing_ms: 50 },
      { actionName: 'findOrCreatePage', passed: true, timing_ms: 120 },
    ];

    const report: ValidationReport = {
      appName: 'test-app',
      url: 'https://example.com',
      timestamp: new Date().toISOString(),
      results,
      overallPassed: results.every((r) => r.passed),
      duration_ms: 170,
    };

    expect(report.overallPassed).toBe(true);
  });
});

describe('ActionValidator', () => {
  it('constructs with default options', () => {
    const validator = new ActionValidator(
      { input: { name: 'input', tiers: ['#input'] } },
      'https://example.com',
    );
    expect(validator).toBeDefined();
  });

  it('constructs with custom options', () => {
    const validator = new ActionValidator(
      { input: { name: 'input', tiers: ['#input'] } },
      'https://example.com',
      { cdpUrl: 'http://127.0.0.1:9333', timeout: 30000, screenshot: false },
    );
    expect(validator).toBeDefined();
  });

  it('validateSelector returns failure for mock page with no elements', async () => {
    const mockPage = {
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockRejectedValue(new Error('not found')),
        }),
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
    };

    const validator = new ActionValidator(
      {},
      'https://example.com',
      { screenshot: false, timeout: 1000 },
    );

    const result = await validator.validateSelector(
      mockPage as any,
      { name: 'testSelector', tiers: ['#nonexistent'] },
    );

    expect(result.actionName).toBe('selector:testSelector');
    expect(result.passed).toBe(false);
    expect(result.error).toContain('Selector not found');
  });

  it('validateSelector returns success for mock page with visible element', async () => {
    const mockLocator = {
      first: vi.fn().mockReturnValue({
        isVisible: vi.fn().mockResolvedValue(true),
      }),
    };
    const mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
    };

    const validator = new ActionValidator(
      {},
      'https://example.com',
      { screenshot: false, timeout: 2000 },
    );

    const result = await validator.validateSelector(
      mockPage as any,
      { name: 'visibleEl', tiers: ['#exists'] },
    );

    expect(result.actionName).toBe('selector:visibleEl');
    expect(result.passed).toBe(true);
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });
});
