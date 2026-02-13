import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';
import type { SnapshotElement, PageRegion } from '../src/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a minimal mock Page that satisfies the subset of Playwright API we use. */
function createMockPage(overrides: Partial<Record<string, any>> = {}): Page {
  const mockCDPSession = {
    send: vi.fn().mockResolvedValue({ nodes: [] }),
    detach: vi.fn().mockResolvedValue(undefined),
  };
  const page = {
    evaluate: vi.fn().mockResolvedValue([]),
    $$eval: vi.fn().mockResolvedValue([]),
    title: vi.fn().mockResolvedValue('Test Page'),
    url: vi.fn().mockReturnValue('https://example.com'),
    goto: vi.fn().mockResolvedValue(null),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    context: vi.fn().mockReturnValue({
      newCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
    }),
    ...overrides,
  } as unknown as Page;
  return page;
}

// ─── Element Discovery ──────────────────────────────────────────────

describe('discoverElements', () => {
  it('discovers interactive elements from page', async () => {
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
      evaluate: vi.fn().mockResolvedValue(mockElements),
    });

    const elements = await discoverElements(page);

    expect(elements).toHaveLength(3);

    // Button
    const btn = elements[0]!;
    expect(btn.id).toBe('el-0');
    expect(btn.type).toBe('button');
    expect(btn.label).toBe('Submit');
    expect(btn.name).toBe('submit');
    expect(btn.states).toContain('visible');
    expect(btn.cssSelectors).toContain('#submit-btn');
    expect(btn.interactiveConfidence).toBe(1.0);

    // Input
    const input = elements[1]!;
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('Type a message...');
    expect(input.cssSelectors).toContain('#chat-input');
    expect(input.cssSelectors).toContain('[data-testid="message-input"]');
    expect(input.interactiveConfidence).toBe(1.0);

    // Link
    const link = elements[2]!;
    expect(link.type).toBe('link');
    expect(link.name).toBe('home');
    expect(link.interactiveConfidence).toBe(0.7);
    expect(link.ariaSelectors).toEqual([]);
  });

  it('marks disabled and hidden elements', async () => {
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
      evaluate: vi.fn().mockResolvedValue(mockElements),
    });

    const elements = await discoverElements(page);
    expect(elements[0]!.states).toContain('hidden');
    expect(elements[0]!.states).toContain('disabled');
    expect(elements[0]!.bounds).toBeUndefined();
  });

  it('returns empty array for page with no interactive elements', async () => {
    const { discoverElements } = await import('../src/snapshot/elements.js');
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue([]),
    });
    const elements = await discoverElements(page);
    expect(elements).toEqual([]);
  });
});

// ─── Region Grouping ────────────────────────────────────────────────

describe('discoverRegions', () => {
  it('groups elements into regions by containment', async () => {
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
      evaluate: vi.fn().mockResolvedValue(rawRegions),
    });

    const elements: SnapshotElement[] = [
      makeElement('el-0', 'logo-link', { x: 10, y: 10, width: 100, height: 30 }),
      makeElement('el-1', 'chat-input', { x: 20, y: 100, width: 500, height: 40 }),
      makeElement('el-2', 'submit-btn', { x: 530, y: 100, width: 80, height: 40 }),
    ];

    const regions = await discoverRegions(page, elements);

    expect(regions).toHaveLength(2);

    const header = regions.find(r => r.name === 'header')!;
    expect(header.elementIds).toContain('el-0');
    expect(header.elementIds).not.toContain('el-1');

    const main = regions.find(r => r.name === 'main')!;
    expect(main.elementIds).toContain('el-1');
    expect(main.elementIds).toContain('el-2');
  });

  it('returns empty regions when page has no landmarks', async () => {
    const { discoverRegions } = await import('../src/snapshot/regions.js');
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue([]),
    });
    const regions = await discoverRegions(page, []);
    expect(regions).toEqual([]);
  });
});

// ─── ARIA Tree ──────────────────────────────────────────────────────

describe('captureAriaTree', () => {
  it('converts CDP accessibility nodes to AriaNode[]', async () => {
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
      send: vi.fn().mockResolvedValue({ nodes: cdpNodes }),
      detach: vi.fn().mockResolvedValue(undefined),
    };

    const page = createMockPage({
      context: vi.fn().mockReturnValue({
        newCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
      }),
    });

    const tree = await captureAriaTree(page);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.role).toBe('navigation');
    expect(tree[0]!.name).toBe('Main Nav');
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children![0]!.role).toBe('link');
    expect(tree[0]!.children![0]!.name).toBe('Home');

    expect(tree[1]!.role).toBe('main');
    expect(tree[1]!.children).toHaveLength(2);
    expect(tree[1]!.children![0]!.role).toBe('textbox');
    expect(tree[1]!.children![1]!.name).toBe('Send');
  });

  it('falls back to DOM-based tree when CDP fails', async () => {
    const { captureAriaTree } = await import('../src/snapshot/aria.js');

    const domAriaNodes = [
      { role: 'navigation', name: 'Main Nav' },
      { role: 'button', name: 'Submit' },
    ];

    const page = createMockPage({
      context: vi.fn().mockReturnValue({
        newCDPSession: vi.fn().mockRejectedValue(new Error('CDP unavailable')),
      }),
      evaluate: vi.fn().mockResolvedValue(domAriaNodes),
    });

    const tree = await captureAriaTree(page);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.role).toBe('navigation');
    expect(tree[1]!.role).toBe('button');
  });

  it('returns empty array when CDP returns no nodes', async () => {
    const { captureAriaTree } = await import('../src/snapshot/aria.js');

    const mockCDPSession = {
      send: vi.fn().mockResolvedValue({ nodes: [] }),
      detach: vi.fn().mockResolvedValue(undefined),
    };

    const page = createMockPage({
      context: vi.fn().mockReturnValue({
        newCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
      }),
    });

    const tree = await captureAriaTree(page);
    expect(tree).toEqual([]);
  });
});

// ─── Screenshots ────────────────────────────────────────────────────

describe('captureScreenshots', () => {
  it('captures full-page and region screenshots', async () => {
    const { captureScreenshots } = await import('../src/snapshot/screenshots.js');

    const fakePng = Buffer.from('fake-screenshot-data');
    const page = createMockPage({
      screenshot: vi.fn().mockResolvedValue(fakePng),
    });

    const regions: PageRegion[] = [
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
    expect(screenshots).toHaveLength(3);
    expect(screenshots[0]!.label).toBe('full-page');
    expect(screenshots[0]!.base64).toBe(fakePng.toString('base64'));
    expect(screenshots[0]!.width).toBe(1280);
    expect(screenshots[0]!.height).toBe(720);

    expect(screenshots[1]!.label).toBe('header');
    expect(screenshots[2]!.label).toBe('main');
  });

  it('skips regions with zero dimensions', async () => {
    const { captureScreenshots } = await import('../src/snapshot/screenshots.js');

    const page = createMockPage({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
    });

    const regions: PageRegion[] = [
      { name: 'empty', role: 'section', bounds: { x: 0, y: 0, width: 0, height: 0 }, elementIds: [] },
    ];

    const screenshots = await captureScreenshots(page, regions);
    // Only full-page, zero-size region skipped
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]!.label).toBe('full-page');
  });
});

// ─── SnapshotEngine ─────────────────────────────────────────────────

describe('SnapshotEngine', () => {
  it('exports SnapshotEngine class', async () => {
    const { SnapshotEngine } = await import('../src/snapshot/engine.js');
    expect(SnapshotEngine).toBeDefined();
    const engine = new SnapshotEngine({ cdpUrl: 'http://localhost:9999' });
    expect(engine).toBeInstanceOf(SnapshotEngine);
  });
});

// ─── Barrel Exports ─────────────────────────────────────────────────

describe('snapshot barrel exports', () => {
  it('exports all public APIs', async () => {
    const barrel = await import('../src/snapshot/index.js');
    expect(barrel.SnapshotEngine).toBeDefined();
    expect(barrel.discoverElements).toBeDefined();
    expect(barrel.discoverRegions).toBeDefined();
    expect(barrel.detectDynamicAreas).toBeDefined();
    expect(barrel.captureAriaTree).toBeDefined();
    expect(barrel.captureScreenshots).toBeDefined();
  });
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeElement(
  id: string,
  name: string,
  bounds: { x: number; y: number; width: number; height: number },
): SnapshotElement {
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
