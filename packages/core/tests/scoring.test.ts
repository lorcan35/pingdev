import { describe, it, expect } from 'vitest';
import { scoreSelectorTier, scoreSelectorDef } from '../src/scoring/selector-scorer.js';
import { scoreAction } from '../src/scoring/action-scorer.js';
import { generateHealthReport } from '../src/scoring/health-reporter.js';
import type { SelectorDef } from '../src/types.js';
import type { ValidationResult } from '../src/scoring/types.js';

// ── Realistic selectors from ChatGPT PingApp ──

const testSelectors: Record<string, SelectorDef> = {
  'prompt-textarea': {
    name: 'prompt-textarea',
    tiers: ['#prompt-textarea', '//*[@id="prompt-textarea"]'],
  },
  'add-photos': {
    name: 'add-photos',
    tiers: ['button[aria-label="Add photos"]', '//button[@aria-label="Add photos"]'],
  },
  'model-selector': {
    name: 'model-selector',
    tiers: ['#radix-_R_76nqp33ih6kcm_', '//*[@id="radix-_R_76nqp33ih6kcm_"]'],
  },
  'login-button': {
    name: 'login-button',
    tiers: ['[data-testid="login-button"]', '//button[contains(text(),"Log in")]'],
  },
};

// ── scoreSelectorTier ──

describe('scoreSelectorTier', () => {
  it('scores ARIA selectors highest (0.9+)', () => {
    const score = scoreSelectorTier('button[aria-label="Add photos"]');
    expect(score.tier).toBe('aria');
    expect(score.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('scores role-based selectors as ARIA', () => {
    const score = scoreSelectorTier('[role="dialog"]');
    expect(score.tier).toBe('aria');
    expect(score.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('scores data-testid high (0.85+)', () => {
    const score = scoreSelectorTier('[data-testid="login-button"]');
    expect(score.tier).toBe('data-testid');
    expect(score.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('scores semantic IDs as stable', () => {
    const score = scoreSelectorTier('#prompt-textarea');
    expect(score.tier).toBe('semantic-id');
    expect(score.confidence).toBeGreaterThanOrEqual(0.7);
    expect(score.confidence).toBeLessThanOrEqual(0.9);
  });

  it('scores auto-generated IDs low', () => {
    const score = scoreSelectorTier('#radix-_R_76nqp33ih6kcm_');
    expect(score.tier).toBe('semantic-id');
    expect(score.confidence).toBeLessThan(0.5);
    expect(score.reason).toContain('Auto-generated');
  });

  it('scores CSS class selectors medium', () => {
    const score = scoreSelectorTier('.btn-primary');
    expect(score.tier).toBe('css-class');
    expect(score.confidence).toBeGreaterThanOrEqual(0.4);
    expect(score.confidence).toBeLessThanOrEqual(0.65);
  });

  it('penalizes long CSS class chains', () => {
    const short = scoreSelectorTier('.btn');
    const long = scoreSelectorTier('.container.wrapper.inner.content.text');
    expect(long.confidence).toBeLessThan(short.confidence);
  });

  it('scores simple XPath with text() higher than positional XPath', () => {
    const textXpath = scoreSelectorTier('//button[contains(text(),"Log in")]');
    const posXpath = scoreSelectorTier('//div[3]/span[2]/button[1]');
    expect(textXpath.tier).toBe('xpath');
    expect(posXpath.tier).toBe('xpath');
    expect(textXpath.confidence).toBeGreaterThan(posXpath.confidence);
  });

  it('scores XPath with dynamic IDs very low', () => {
    const score = scoreSelectorTier('//*[@id="radix-_R_76nqp33ih6kcm_"]');
    expect(score.tier).toBe('xpath');
    expect(score.confidence).toBeLessThan(0.3);
  });

  it('scores positional selectors lowest', () => {
    const score = scoreSelectorTier('div:nth-child(3) > span');
    expect(score.tier).toBe('positional');
    expect(score.confidence).toBeLessThanOrEqual(0.3);
  });

  it('scores name/type attributes as semantic-id', () => {
    const score = scoreSelectorTier('input[name="email"]');
    expect(score.tier).toBe('semantic-id');
    expect(score.confidence).toBeGreaterThanOrEqual(0.65);
  });
});

// ── scoreSelectorDef ──

describe('scoreSelectorDef', () => {
  it('returns scores sorted by confidence (highest first)', () => {
    const scores = scoreSelectorDef(testSelectors['add-photos']);
    expect(scores.length).toBe(2);
    expect(scores[0].confidence).toBeGreaterThanOrEqual(scores[1].confidence);
    // The ARIA tier should be first
    expect(scores[0].tier).toBe('aria');
  });

  it('handles radix IDs — both tiers score low', () => {
    const scores = scoreSelectorDef(testSelectors['model-selector']);
    expect(scores.length).toBe(2);
    for (const score of scores) {
      expect(score.confidence).toBeLessThan(0.5);
    }
  });

  it('scores login-button with data-testid highest', () => {
    const scores = scoreSelectorDef(testSelectors['login-button']);
    expect(scores[0].tier).toBe('data-testid');
    expect(scores[0].confidence).toBeGreaterThanOrEqual(0.85);
  });
});

// ── scoreAction ──

describe('scoreAction', () => {
  it('computes overall score with selector confidence only (no validation)', () => {
    const action = scoreAction('add-photos', [testSelectors['add-photos']]);
    expect(action.actionName).toBe('add-photos');
    expect(action.overallScore).toBeGreaterThan(0);
    expect(action.overallScore).toBeLessThanOrEqual(1);
    // Default pass rate = 1, timing consistency = 1
    expect(action.testPassRate).toBe(1);
    expect(action.timingConsistency).toBe(1);
  });

  it('factors in validation results', () => {
    const validation: ValidationResult = {
      actionName: 'login',
      passed: 8,
      failed: 2,
      timings_ms: [100, 110, 105, 120, 95, 130, 100, 115, 108, 102],
    };

    const action = scoreAction('login', [testSelectors['login-button']], validation);
    expect(action.testPassRate).toBe(0.8);
    expect(action.avgTiming_ms).toBeGreaterThan(0);
    expect(action.timingConsistency).toBeGreaterThan(0);
    expect(action.timingConsistency).toBeLessThanOrEqual(1);
  });

  it('handles zero validation results gracefully', () => {
    const validation: ValidationResult = {
      actionName: 'empty',
      passed: 0,
      failed: 0,
      timings_ms: [],
    };
    const action = scoreAction('empty', [testSelectors['prompt-textarea']], validation);
    expect(action.testPassRate).toBe(0);
    expect(action.avgTiming_ms).toBe(0);
  });

  it('low-confidence selectors reduce overall score', () => {
    const goodAction = scoreAction('good', [testSelectors['add-photos']]);
    const badAction = scoreAction('bad', [testSelectors['model-selector']]);
    expect(goodAction.overallScore).toBeGreaterThan(badAction.overallScore);
  });
});

// ── generateHealthReport ──

describe('generateHealthReport', () => {
  it('generates a valid health report', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    expect(report.appName).toBe('chatgpt');
    expect(report.url).toBe('https://chatgpt.com');
    expect(report.timestamp).toBeTruthy();
    expect(report.actionScores.length).toBe(4);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it('warns about auto-generated IDs', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    const radixWarnings = report.warnings.filter(w => w.includes('auto-generated') || w.includes('Auto-generated'));
    expect(radixWarnings.length).toBeGreaterThan(0);
  });

  it('warns about low-confidence selectors', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    const lowConfWarnings = report.warnings.filter(w => w.includes('low confidence'));
    expect(lowConfWarnings.length).toBeGreaterThan(0);
  });

  it('generates recommendations for missing ARIA/data-testid', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    // prompt-textarea has no ARIA or data-testid → should recommend adding one
    const recs = report.recommendations.filter(r =>
      r.includes('data-testid') || r.includes('ARIA')
    );
    expect(recs.length).toBeGreaterThan(0);
  });

  it('generates recommendation about auto-generated IDs', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    const radixRecs = report.recommendations.filter(r => r.includes('auto-generated'));
    expect(radixRecs.length).toBeGreaterThan(0);
  });

  it('overall score is reasonable for mixed selectors', () => {
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors);
    // Mix of good (ARIA, data-testid) and bad (radix) selectors
    expect(report.overallScore).toBeGreaterThanOrEqual(40);
    expect(report.overallScore).toBeLessThanOrEqual(90);
  });

  it('handles validation report', () => {
    const validationReport = {
      results: [
        { actionName: 'add-photos', passed: 10, failed: 0, timings_ms: [50, 55, 48, 52] },
        { actionName: 'login-button', passed: 9, failed: 1, timings_ms: [100, 120, 110] },
      ],
    };
    const report = generateHealthReport('chatgpt', 'https://chatgpt.com', testSelectors, validationReport);
    expect(report.actionScores.length).toBe(4);

    const addPhotos = report.actionScores.find(a => a.actionName === 'add-photos');
    expect(addPhotos?.testPassRate).toBe(1);
    expect(addPhotos?.avgTiming_ms).toBeGreaterThan(0);
  });

  it('handles empty selectors', () => {
    const report = generateHealthReport('empty', 'https://example.com', {});
    expect(report.overallScore).toBe(0);
    expect(report.actionScores.length).toBe(0);
    expect(report.warnings.length).toBe(0);
  });
});
