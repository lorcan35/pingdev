// @pingdev/std — Tests for PingApp Generator
import { describe, it, expect } from 'vitest';
import { PingAppGenerator } from '../pingapp-generator.js';
function makeRecording(overrides = {}) {
    return {
        id: 'rec-1',
        startedAt: Date.now(),
        url: 'https://www.amazon.com/dp/B123',
        actions: [
            {
                type: 'click',
                timestamp: 1000,
                selectors: { css: '#search-input', ariaLabel: 'Search' },
            },
            {
                type: 'input',
                timestamp: 1500,
                selectors: { css: '#search-input', ariaLabel: 'Search' },
                value: 'headphones',
            },
            {
                type: 'keydown',
                timestamp: 2000,
                selectors: {},
                value: 'Enter',
            },
            {
                type: 'click',
                timestamp: 3000,
                selectors: {
                    css: '.result-card:first-child a',
                    textContent: 'Premium Headphones',
                    nthChild: 'div > a:nth-child(1)',
                },
            },
        ],
        ...overrides,
    };
}
describe('PingAppGenerator', () => {
    const generator = new PingAppGenerator();
    describe('generate', () => {
        it('produces a complete PingApp definition', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            expect(app.manifest).toBeDefined();
            expect(app.workflow).toBeDefined();
            expect(app.selectors).toBeDefined();
            expect(app.test).toBeDefined();
        });
        it('generates correct manifest', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            expect(app.manifest.name).toBe('amazon');
            expect(app.manifest.url).toBe('https://www.amazon.com/dp/B123');
            expect(app.manifest.version).toBe('1.0.0');
            expect(app.manifest.actionCount).toBe(4);
        });
        it('uses custom name when provided', () => {
            const recording = makeRecording();
            const app = generator.generate(recording, 'my-custom-app');
            expect(app.manifest.name).toBe('my-custom-app');
            expect(app.workflow.name).toBe('my-custom-app');
        });
        it('generates selectors with fallbacks', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            const selectorKeys = Object.keys(app.selectors);
            expect(selectorKeys.length).toBeGreaterThan(0);
            // First element has ID-based CSS selector
            const searchSelector = Object.values(app.selectors).find((s) => s.primary === '#search-input');
            expect(searchSelector).toBeDefined();
            expect(searchSelector.fallbacks.length).toBeGreaterThan(0);
            expect(searchSelector.confidence).toBeGreaterThan(0.5); // ID selector = high confidence
        });
        it('generates workflow steps matching recorded actions', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            expect(app.workflow.steps).toHaveLength(4);
            expect(app.workflow.steps[0].op).toBe('click');
            expect(app.workflow.steps[1].op).toBe('type');
            expect(app.workflow.steps[1].value).toBe('headphones');
            expect(app.workflow.steps[2].op).toBe('press');
            expect(app.workflow.steps[2].value).toBe('Enter');
            expect(app.workflow.steps[3].op).toBe('click');
        });
        it('generates test with up to 5 steps', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            // Only click and input actions are included in tests
            expect(app.test.steps.length).toBeLessThanOrEqual(5);
            expect(app.test.steps.length).toBeGreaterThan(0);
            expect(app.test.name).toBe('test_amazon');
        });
    });
    describe('serialize', () => {
        it('produces file map with required files', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            const files = generator.serialize(app);
            expect(files['manifest.json']).toBeDefined();
            expect(files['selectors.json']).toBeDefined();
            expect(files[`workflows/amazon.json`]).toBeDefined();
            expect(files[`tests/test_amazon.json`]).toBeDefined();
            // Verify JSON is valid
            expect(() => JSON.parse(files['manifest.json'])).not.toThrow();
            expect(() => JSON.parse(files['selectors.json'])).not.toThrow();
        });
        it('manifest JSON contains expected fields', () => {
            const recording = makeRecording();
            const app = generator.generate(recording);
            const files = generator.serialize(app);
            const manifest = JSON.parse(files['manifest.json']);
            expect(manifest.name).toBe('amazon');
            expect(manifest.url).toBe('https://www.amazon.com/dp/B123');
            expect(manifest.actionCount).toBe(4);
        });
    });
    describe('edge cases', () => {
        it('handles recording with no selectors gracefully', () => {
            const recording = makeRecording({
                actions: [
                    { type: 'navigate', timestamp: 1000, selectors: {}, value: 'https://example.com' },
                    { type: 'scroll', timestamp: 2000, selectors: {} },
                ],
            });
            const app = generator.generate(recording);
            expect(app.workflow.steps).toHaveLength(2);
            expect(Object.keys(app.selectors).length).toBe(0);
        });
        it('handles recording with single action', () => {
            const recording = makeRecording({
                actions: [
                    { type: 'click', timestamp: 1000, selectors: { css: '#btn' } },
                ],
            });
            const app = generator.generate(recording);
            expect(app.workflow.steps).toHaveLength(1);
            expect(app.manifest.actionCount).toBe(1);
        });
        it('derives app name from URL hostname', () => {
            const recording = makeRecording({ url: 'https://mail.google.com/inbox' });
            const app = generator.generate(recording);
            // Should derive "mail" from mail.google.com
            expect(app.manifest.name).toBe('mail');
        });
    });
});
//# sourceMappingURL=pingapp-generator.test.js.map