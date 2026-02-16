"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ─── Helpers ────────────────────────────────────────────────────────
/** Create a minimal mock Page that satisfies the subset of Playwright API we use. */
function createMockPage(overrides = {}) {
    const mockCDPSession = {
        send: vitest_1.vi.fn().mockResolvedValue({ nodes: [] }),
        detach: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    const page = {
        evaluate: vitest_1.vi.fn().mockResolvedValue([]),
        $$eval: vitest_1.vi.fn().mockResolvedValue([]),
        title: vitest_1.vi.fn().mockResolvedValue('Test Page'),
        url: vitest_1.vi.fn().mockReturnValue('https://example.com'),
        goto: vitest_1.vi.fn().mockResolvedValue(null),
        viewportSize: vitest_1.vi.fn().mockReturnValue({ width: 1280, height: 720 }),
        screenshot: vitest_1.vi.fn().mockResolvedValue(Buffer.from('fake-png')),
        context: vitest_1.vi.fn().mockReturnValue({
            newCDPSession: vitest_1.vi.fn().mockResolvedValue(mockCDPSession),
        }),
        ...overrides,
    };
    return page;
}
// ─── Element Discovery ──────────────────────────────────────────────
(0, vitest_1.describe)('discoverElements', () => {
    (0, vitest_1.it)('discovers interactive elements from page', async () => {
        const { discoverElements } = await import('../src/snapshot/elements.js');
        const mockElements = [
            {
                tagName: 'button',
                type: 'button',
                role: null,
                ariaLabel: 'Submit',
                placeholder: null,
                title: null,
                value: null,
                textContent: 'Submit',
                id: 'submit-btn',
                testId: null,
                classList: ['btn', 'btn-primary'],
                isVisible: true,
                isDisabled: false,
                isChecked: false,
                isContentEditable: false,
                hasOnclick: false,
                tabIndex: 0,
                inputType: null,
                bounds: { x: 100, y: 200, width: 80, height: 30 },
                index: 0,
            },
            {
                tagName: 'input',
                type: 'input',
                role: null,
                ariaLabel: null,
                placeholder: 'Type a message...',
                title: null,
                value: '',
                textContent: '',
                id: 'chat-input',
                testId: 'message-input',
                classList: ['input-field'],
                isVisible: true,
                isDisabled: false,
                isChecked: false,
                isContentEditable: false,
                hasOnclick: false,
                tabIndex: 0,
                inputType: 'text',
                bounds: { x: 10, y: 200, width: 300, height: 30 },
                index: 1,
            },
            {
                tagName: 'a',
                type: 'a',
                role: null,
                ariaLabel: null,
                placeholder: null,
                title: null,
                value: null,
                textContent: 'Home',
                id: null,
                testId: null,
                classList: ['nav-link'],
                isVisible: true,
                isDisabled: false,
                isChecked: false,
                isContentEditable: false,
                hasOnclick: false,
                tabIndex: 0,
                inputType: null,
                bounds: { x: 10, y: 10, width: 60, height: 20 },
                index: 2,
            },
        ];
        const page = createMockPage({
            evaluate: vitest_1.vi.fn().mockResolvedValue(mockElements),
        });
        const elements = await discoverElements(page);
        (0, vitest_1.expect)(elements).toHaveLength(3);
        // Button
        const btn = elements[0];
        (0, vitest_1.expect)(btn.id).toBe('el-0');
        (0, vitest_1.expect)(btn.type).toBe('button');
        (0, vitest_1.expect)(btn.label).toBe('Submit');
        (0, vitest_1.expect)(btn.name).toBe('submit');
        (0, vitest_1.expect)(btn.states).toContain('visible');
        (0, vitest_1.expect)(btn.cssSelectors).toContain('#submit-btn');
        (0, vitest_1.expect)(btn.interactiveConfidence).toBe(1.0);
        // Input
        const input = elements[1];
        (0, vitest_1.expect)(input.type).toBe('text');
        (0, vitest_1.expect)(input.placeholder).toBe('Type a message...');
        (0, vitest_1.expect)(input.cssSelectors).toContain('#chat-input');
        (0, vitest_1.expect)(input.cssSelectors).toContain('[data-testid="message-input"]');
        (0, vitest_1.expect)(input.interactiveConfidence).toBe(1.0);
        // Link
        const link = elements[2];
        (0, vitest_1.expect)(link.type).toBe('link');
        (0, vitest_1.expect)(link.name).toBe('home');
        (0, vitest_1.expect)(link.interactiveConfidence).toBe(0.7);
        (0, vitest_1.expect)(link.ariaSelectors).toEqual([]);
    });
    (0, vitest_1.it)('marks disabled and hidden elements', async () => {
        const { discoverElements } = await import('../src/snapshot/elements.js');
        const mockElements = [
            {
                tagName: 'button',
                type: 'button',
                role: null,
                ariaLabel: 'Disabled Button',
                placeholder: null,
                title: null,
                value: null,
                textContent: 'Disabled',
                id: null,
                testId: null,
                classList: [],
                isVisible: false,
                isDisabled: true,
                isChecked: false,
                isContentEditable: false,
                hasOnclick: false,
                tabIndex: -1,
                inputType: null,
                bounds: null,
                index: 0,
            },
        ];
        const page = createMockPage({
            evaluate: vitest_1.vi.fn().mockResolvedValue(mockElements),
        });
        const elements = await discoverElements(page);
        (0, vitest_1.expect)(elements[0].states).toContain('hidden');
        (0, vitest_1.expect)(elements[0].states).toContain('disabled');
        (0, vitest_1.expect)(elements[0].bounds).toBeUndefined();
    });
    (0, vitest_1.it)('returns empty array for page with no interactive elements', async () => {
        const { discoverElements } = await import('../src/snapshot/elements.js');
        const page = createMockPage({
            evaluate: vitest_1.vi.fn().mockResolvedValue([]),
        });
        const elements = await discoverElements(page);
        (0, vitest_1.expect)(elements).toEqual([]);
    });
});
// ─── Region Grouping ────────────────────────────────────────────────
(0, vitest_1.describe)('discoverRegions', () => {
    (0, vitest_1.it)('groups elements into regions by containment', async () => {
        const { discoverRegions } = await import('../src/snapshot/regions.js');
        const rawRegions = [
            {
                name: 'header',
                role: 'header',
                bounds: { x: 0, y: 0, width: 1280, height: 60 },
                selector: 'header',
            },
            {
                name: 'main',
                role: 'main',
                bounds: { x: 0, y: 60, width: 1280, height: 600 },
                selector: 'main',
            },
        ];
        const page = createMockPage({
            evaluate: vitest_1.vi.fn().mockResolvedValue(rawRegions),
        });
        const elements = [
            makeElement('el-0', 'logo-link', { x: 10, y: 10, width: 100, height: 30 }),
            makeElement('el-1', 'chat-input', { x: 20, y: 100, width: 500, height: 40 }),
            makeElement('el-2', 'submit-btn', { x: 530, y: 100, width: 80, height: 40 }),
        ];
        const regions = await discoverRegions(page, elements);
        (0, vitest_1.expect)(regions).toHaveLength(2);
        const header = regions.find(r => r.name === 'header');
        (0, vitest_1.expect)(header.elementIds).toContain('el-0');
        (0, vitest_1.expect)(header.elementIds).not.toContain('el-1');
        const main = regions.find(r => r.name === 'main');
        (0, vitest_1.expect)(main.elementIds).toContain('el-1');
        (0, vitest_1.expect)(main.elementIds).toContain('el-2');
    });
    (0, vitest_1.it)('returns empty regions when page has no landmarks', async () => {
        const { discoverRegions } = await import('../src/snapshot/regions.js');
        const page = createMockPage({
            evaluate: vitest_1.vi.fn().mockResolvedValue([]),
        });
        const regions = await discoverRegions(page, []);
        (0, vitest_1.expect)(regions).toEqual([]);
    });
});
// ─── ARIA Tree ──────────────────────────────────────────────────────
(0, vitest_1.describe)('captureAriaTree', () => {
    (0, vitest_1.it)('converts CDP accessibility nodes to AriaNode[]', async () => {
        const { captureAriaTree } = await import('../src/snapshot/aria.js');
        const cdpNodes = [
            { nodeId: '1', role: { value: 'WebArea' }, name: { value: 'Test Page' } },
            { nodeId: '2', parentId: '1', role: { value: 'navigation' }, name: { value: 'Main Nav' } },
            { nodeId: '3', parentId: '2', role: { value: 'link' }, name: { value: 'Home' } },
            { nodeId: '4', parentId: '2', role: { value: 'link' }, name: { value: 'About' } },
            { nodeId: '5', parentId: '1', role: { value: 'main' }, name: { value: '' } },
            { nodeId: '6', parentId: '5', role: { value: 'textbox' }, name: { value: 'Message' }, value: { value: '' } },
            { nodeId: '7', parentId: '5', role: { value: 'button' }, name: { value: 'Send' }, properties: [{ name: 'disabled', value: { value: false } }] },
        ];
        const mockCDPSession = {
            send: vitest_1.vi.fn().mockResolvedValue({ nodes: cdpNodes }),
            detach: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        const page = createMockPage({
            context: vitest_1.vi.fn().mockReturnValue({
                newCDPSession: vitest_1.vi.fn().mockResolvedValue(mockCDPSession),
            }),
        });
        const tree = await captureAriaTree(page);
        (0, vitest_1.expect)(tree).toHaveLength(2);
        (0, vitest_1.expect)(tree[0].role).toBe('navigation');
        (0, vitest_1.expect)(tree[0].name).toBe('Main Nav');
        (0, vitest_1.expect)(tree[0].children).toHaveLength(2);
        (0, vitest_1.expect)(tree[0].children[0].role).toBe('link');
        (0, vitest_1.expect)(tree[0].children[0].name).toBe('Home');
        (0, vitest_1.expect)(tree[1].role).toBe('main');
        (0, vitest_1.expect)(tree[1].children).toHaveLength(2);
        (0, vitest_1.expect)(tree[1].children[0].role).toBe('textbox');
        (0, vitest_1.expect)(tree[1].children[1].name).toBe('Send');
    });
    (0, vitest_1.it)('falls back to DOM-based tree when CDP fails', async () => {
        const { captureAriaTree } = await import('../src/snapshot/aria.js');
        const domAriaNodes = [
            { role: 'navigation', name: 'Main Nav' },
            { role: 'button', name: 'Submit' },
        ];
        const page = createMockPage({
            context: vitest_1.vi.fn().mockReturnValue({
                newCDPSession: vitest_1.vi.fn().mockRejectedValue(new Error('CDP unavailable')),
            }),
            evaluate: vitest_1.vi.fn().mockResolvedValue(domAriaNodes),
        });
        const tree = await captureAriaTree(page);
        (0, vitest_1.expect)(tree).toHaveLength(2);
        (0, vitest_1.expect)(tree[0].role).toBe('navigation');
        (0, vitest_1.expect)(tree[1].role).toBe('button');
    });
    (0, vitest_1.it)('returns empty array when CDP returns no nodes', async () => {
        const { captureAriaTree } = await import('../src/snapshot/aria.js');
        const mockCDPSession = {
            send: vitest_1.vi.fn().mockResolvedValue({ nodes: [] }),
            detach: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        const page = createMockPage({
            context: vitest_1.vi.fn().mockReturnValue({
                newCDPSession: vitest_1.vi.fn().mockResolvedValue(mockCDPSession),
            }),
        });
        const tree = await captureAriaTree(page);
        (0, vitest_1.expect)(tree).toEqual([]);
    });
});
// ─── Screenshots ────────────────────────────────────────────────────
(0, vitest_1.describe)('captureScreenshots', () => {
    (0, vitest_1.it)('captures full-page and region screenshots', async () => {
        const { captureScreenshots } = await import('../src/snapshot/screenshots.js');
        const fakePng = Buffer.from('fake-screenshot-data');
        const page = createMockPage({
            screenshot: vitest_1.vi.fn().mockResolvedValue(fakePng),
        });
        const regions = [
            {
                name: 'header',
                role: 'header',
                bounds: { x: 0, y: 0, width: 1280, height: 60 },
                elementIds: [],
            },
            {
                name: 'main',
                role: 'main',
                bounds: { x: 0, y: 60, width: 1280, height: 600 },
                elementIds: [],
            },
        ];
        const screenshots = await captureScreenshots(page, regions);
        // full-page + 2 regions
        (0, vitest_1.expect)(screenshots).toHaveLength(3);
        (0, vitest_1.expect)(screenshots[0].label).toBe('full-page');
        (0, vitest_1.expect)(screenshots[0].base64).toBe(fakePng.toString('base64'));
        (0, vitest_1.expect)(screenshots[0].width).toBe(1280);
        (0, vitest_1.expect)(screenshots[0].height).toBe(720);
        (0, vitest_1.expect)(screenshots[1].label).toBe('header');
        (0, vitest_1.expect)(screenshots[2].label).toBe('main');
    });
    (0, vitest_1.it)('skips regions with zero dimensions', async () => {
        const { captureScreenshots } = await import('../src/snapshot/screenshots.js');
        const page = createMockPage({
            screenshot: vitest_1.vi.fn().mockResolvedValue(Buffer.from('png')),
        });
        const regions = [
            { name: 'empty', role: 'section', bounds: { x: 0, y: 0, width: 0, height: 0 }, elementIds: [] },
        ];
        const screenshots = await captureScreenshots(page, regions);
        // Only full-page, zero-size region skipped
        (0, vitest_1.expect)(screenshots).toHaveLength(1);
        (0, vitest_1.expect)(screenshots[0].label).toBe('full-page');
    });
});
// ─── SnapshotEngine ─────────────────────────────────────────────────
(0, vitest_1.describe)('SnapshotEngine', () => {
    (0, vitest_1.it)('exports SnapshotEngine class', async () => {
        const { SnapshotEngine } = await import('../src/snapshot/engine.js');
        (0, vitest_1.expect)(SnapshotEngine).toBeDefined();
        const engine = new SnapshotEngine({ cdpUrl: 'http://localhost:9999' });
        (0, vitest_1.expect)(engine).toBeInstanceOf(SnapshotEngine);
    });
});
// ─── Barrel Exports ─────────────────────────────────────────────────
(0, vitest_1.describe)('snapshot barrel exports', () => {
    (0, vitest_1.it)('exports all public APIs', async () => {
        const barrel = await import('../src/snapshot/index.js');
        (0, vitest_1.expect)(barrel.SnapshotEngine).toBeDefined();
        (0, vitest_1.expect)(barrel.discoverElements).toBeDefined();
        (0, vitest_1.expect)(barrel.discoverRegions).toBeDefined();
        (0, vitest_1.expect)(barrel.detectDynamicAreas).toBeDefined();
        (0, vitest_1.expect)(barrel.captureAriaTree).toBeDefined();
        (0, vitest_1.expect)(barrel.captureScreenshots).toBeDefined();
    });
});
// ─── Helpers ────────────────────────────────────────────────────────
function makeElement(id, name, bounds) {
    return {
        id,
        name,
        type: 'button',
        states: ['visible'],
        cssSelectors: [],
        xpathSelectors: [],
        ariaSelectors: [],
        bounds,
        interactiveConfidence: 1.0,
    };
}
//# sourceMappingURL=snapshot.test.js.map