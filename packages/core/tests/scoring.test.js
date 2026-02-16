"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const selector_scorer_js_1 = require("../src/scoring/selector-scorer.js");
const action_scorer_js_1 = require("../src/scoring/action-scorer.js");
const health_reporter_js_1 = require("../src/scoring/health-reporter.js");
// ── Realistic selectors from ChatGPT PingApp ──
const testSelectors = {
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
(0, vitest_1.describe)('scoreSelectorTier', () => {
    (0, vitest_1.it)('scores ARIA selectors highest (0.9+)', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('button[aria-label="Add photos"]');
        (0, vitest_1.expect)(score.tier).toBe('aria');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.9);
    });
    (0, vitest_1.it)('scores role-based selectors as ARIA', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('[role="dialog"]');
        (0, vitest_1.expect)(score.tier).toBe('aria');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.9);
    });
    (0, vitest_1.it)('scores data-testid high (0.85+)', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('[data-testid="login-button"]');
        (0, vitest_1.expect)(score.tier).toBe('data-testid');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.85);
    });
    (0, vitest_1.it)('scores semantic IDs as stable', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('#prompt-textarea');
        (0, vitest_1.expect)(score.tier).toBe('semantic-id');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.7);
        (0, vitest_1.expect)(score.confidence).toBeLessThanOrEqual(0.9);
    });
    (0, vitest_1.it)('scores auto-generated IDs low', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('#radix-_R_76nqp33ih6kcm_');
        (0, vitest_1.expect)(score.tier).toBe('semantic-id');
        (0, vitest_1.expect)(score.confidence).toBeLessThan(0.5);
        (0, vitest_1.expect)(score.reason).toContain('Auto-generated');
    });
    (0, vitest_1.it)('scores CSS class selectors medium', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('.btn-primary');
        (0, vitest_1.expect)(score.tier).toBe('css-class');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.4);
        (0, vitest_1.expect)(score.confidence).toBeLessThanOrEqual(0.65);
    });
    (0, vitest_1.it)('penalizes long CSS class chains', () => {
        const short = (0, selector_scorer_js_1.scoreSelectorTier)('.btn');
        const long = (0, selector_scorer_js_1.scoreSelectorTier)('.container.wrapper.inner.content.text');
        (0, vitest_1.expect)(long.confidence).toBeLessThan(short.confidence);
    });
    (0, vitest_1.it)('scores simple XPath with text() higher than positional XPath', () => {
        const textXpath = (0, selector_scorer_js_1.scoreSelectorTier)('//button[contains(text(),"Log in")]');
        const posXpath = (0, selector_scorer_js_1.scoreSelectorTier)('//div[3]/span[2]/button[1]');
        (0, vitest_1.expect)(textXpath.tier).toBe('xpath');
        (0, vitest_1.expect)(posXpath.tier).toBe('xpath');
        (0, vitest_1.expect)(textXpath.confidence).toBeGreaterThan(posXpath.confidence);
    });
    (0, vitest_1.it)('scores XPath with dynamic IDs very low', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('//*[@id="radix-_R_76nqp33ih6kcm_"]');
        (0, vitest_1.expect)(score.tier).toBe('xpath');
        (0, vitest_1.expect)(score.confidence).toBeLessThan(0.3);
    });
    (0, vitest_1.it)('scores positional selectors lowest', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('div:nth-child(3) > span');
        (0, vitest_1.expect)(score.tier).toBe('positional');
        (0, vitest_1.expect)(score.confidence).toBeLessThanOrEqual(0.3);
    });
    (0, vitest_1.it)('scores name/type attributes as semantic-id', () => {
        const score = (0, selector_scorer_js_1.scoreSelectorTier)('input[name="email"]');
        (0, vitest_1.expect)(score.tier).toBe('semantic-id');
        (0, vitest_1.expect)(score.confidence).toBeGreaterThanOrEqual(0.65);
    });
});
// ── scoreSelectorDef ──
(0, vitest_1.describe)('scoreSelectorDef', () => {
    (0, vitest_1.it)('returns scores sorted by confidence (highest first)', () => {
        const scores = (0, selector_scorer_js_1.scoreSelectorDef)(testSelectors['add-photos']);
        (0, vitest_1.expect)(scores.length).toBe(2);
        (0, vitest_1.expect)(scores[0].confidence).toBeGreaterThanOrEqual(scores[1].confidence);
        // The ARIA tier should be first
        (0, vitest_1.expect)(scores[0].tier).toBe('aria');
    });
    (0, vitest_1.it)('handles radix IDs — both tiers score low', () => {
        const scores = (0, selector_scorer_js_1.scoreSelectorDef)(testSelectors['model-selector']);
        (0, vitest_1.expect)(scores.length).toBe(2);
        for (const score of scores) {
            (0, vitest_1.expect)(score.confidence).toBeLessThan(0.5);
        }
    });
    (0, vitest_1.it)('scores login-button with data-testid highest', () => {
        const scores = (0, selector_scorer_js_1.scoreSelectorDef)(testSelectors['login-button']);
        (0, vitest_1.expect)(scores[0].tier).toBe('data-testid');
        (0, vitest_1.expect)(scores[0].confidence).toBeGreaterThanOrEqual(0.85);
    });
});
// ── scoreAction ──
(0, vitest_1.describe)('scoreAction', () => {
    (0, vitest_1.it)('computes overall score with selector confidence only (no validation)', () => {
        const action = (0, action_scorer_js_1.scoreAction)('add-photos', [testSelectors['add-photos']]);
        (0, vitest_1.expect)(action.actionName).toBe('add-photos');
        (0, vitest_1.expect)(action.overallScore).toBeGreaterThan(0);
        (0, vitest_1.expect)(action.overallScore).toBeLessThanOrEqual(1);
        // Default pass rate = 1, timing consistency = 1
        (0, vitest_1.expect)(action.testPassRate).toBe(1);
        (0, vitest_1.expect)(action.timingConsistency).toBe(1);
    });
    (0, vitest_1.it)('factors in validation results', () => {
        const validation = {
            actionName: 'login',
            passed: 8,
            failed: 2,
            timings_ms: [100, 110, 105, 120, 95, 130, 100, 115, 108, 102],
        };
        const action = (0, action_scorer_js_1.scoreAction)('login', [testSelectors['login-button']], validation);
        (0, vitest_1.expect)(action.testPassRate).toBe(0.8);
        (0, vitest_1.expect)(action.avgTiming_ms).toBeGreaterThan(0);
        (0, vitest_1.expect)(action.timingConsistency).toBeGreaterThan(0);
        (0, vitest_1.expect)(action.timingConsistency).toBeLessThanOrEqual(1);
    });
    (0, vitest_1.it)('handles zero validation results gracefully', () => {
        const validation = {
            actionName: 'empty',
            passed: 0,
            failed: 0,
            timings_ms: [],
        };
        const action = (0, action_scorer_js_1.scoreAction)('empty', [testSelectors['prompt-textarea']], validation);
        (0, vitest_1.expect)(action.testPassRate).toBe(0);
        (0, vitest_1.expect)(action.avgTiming_ms).toBe(0);
    });
    (0, vitest_1.it)('low-confidence selectors reduce overall score', () => {
        const goodAction = (0, action_scorer_js_1.scoreAction)('good', [testSelectors['add-photos']]);
        const badAction = (0, action_scorer_js_1.scoreAction)('bad', [testSelectors['model-selector']]);
        (0, vitest_1.expect)(goodAction.overallScore).toBeGreaterThan(badAction.overallScore);
    });
});
// ── generateHealthReport ──
(0, vitest_1.describe)('generateHealthReport', () => {
    (0, vitest_1.it)('generates a valid health report', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        (0, vitest_1.expect)(report.appName).toBe('chatgpt');
        (0, vitest_1.expect)(report.url).toBe('https://chatgpt.com');
        (0, vitest_1.expect)(report.timestamp).toBeTruthy();
        (0, vitest_1.expect)(report.actionScores.length).toBe(4);
        (0, vitest_1.expect)(report.overallScore).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(report.overallScore).toBeLessThanOrEqual(100);
    });
    (0, vitest_1.it)('warns about auto-generated IDs', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        const radixWarnings = report.warnings.filter(w => w.includes('auto-generated') || w.includes('Auto-generated'));
        (0, vitest_1.expect)(radixWarnings.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('warns about low-confidence selectors', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        const lowConfWarnings = report.warnings.filter(w => w.includes('low confidence'));
        (0, vitest_1.expect)(lowConfWarnings.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('generates recommendations for missing ARIA/data-testid', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        // prompt-textarea has no ARIA or data-testid → should recommend adding one
        const recs = report.recommendations.filter(r => r.includes('data-testid') || r.includes('ARIA'));
        (0, vitest_1.expect)(recs.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('generates recommendation about auto-generated IDs', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        const radixRecs = report.recommendations.filter(r => r.includes('auto-generated'));
        (0, vitest_1.expect)(radixRecs.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('overall score is reasonable for mixed selectors', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors);
        // Mix of good (ARIA, data-testid) and bad (radix) selectors
        (0, vitest_1.expect)(report.overallScore).toBeGreaterThanOrEqual(40);
        (0, vitest_1.expect)(report.overallScore).toBeLessThanOrEqual(90);
    });
    (0, vitest_1.it)('handles validation report', () => {
        const validationReport = {
            results: [
                { actionName: 'add-photos', passed: 10, failed: 0, timings_ms: [50, 55, 48, 52] },
                { actionName: 'login-button', passed: 9, failed: 1, timings_ms: [100, 120, 110] },
            ],
        };
        const report = (0, health_reporter_js_1.generateHealthReport)('chatgpt', 'https://chatgpt.com', testSelectors, validationReport);
        (0, vitest_1.expect)(report.actionScores.length).toBe(4);
        const addPhotos = report.actionScores.find(a => a.actionName === 'add-photos');
        (0, vitest_1.expect)(addPhotos?.testPassRate).toBe(1);
        (0, vitest_1.expect)(addPhotos?.avgTiming_ms).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('handles empty selectors', () => {
        const report = (0, health_reporter_js_1.generateHealthReport)('empty', 'https://example.com', {});
        (0, vitest_1.expect)(report.overallScore).toBe(0);
        (0, vitest_1.expect)(report.actionScores.length).toBe(0);
        (0, vitest_1.expect)(report.warnings.length).toBe(0);
    });
});
//# sourceMappingURL=scoring.test.js.map