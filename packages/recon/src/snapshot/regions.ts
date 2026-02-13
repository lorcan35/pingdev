/**
 * Region grouping — assigns elements to page regions (header, nav, main, footer, etc.).
 */
import type { Page } from 'playwright';
import type { PageRegion, SnapshotElement } from '../types.js';

/** Mapping of landmark roles / tags / classes to region roles. */
const REGION_ROLES: Record<string, string> = {
  banner: 'header',
  navigation: 'nav',
  main: 'main',
  contentinfo: 'footer',
  complementary: 'complementary',
  form: 'form',
  dialog: 'dialog',
  search: 'search',
};

const TAG_TO_ROLE: Record<string, string> = {
  header: 'header',
  nav: 'nav',
  main: 'main',
  footer: 'footer',
  aside: 'complementary',
  form: 'form',
  dialog: 'dialog',
  section: 'section',
};

const CLASS_PATTERNS: [RegExp, string][] = [
  [/\bheader\b/i, 'header'],
  [/\bnav(bar|igation)?\b/i, 'nav'],
  [/\bfooter\b/i, 'footer'],
  [/\bsidebar\b/i, 'complementary'],
  [/\bchat[-_]?area\b/i, 'main'],
  [/\bcontent\b/i, 'main'],
  [/\bmain\b/i, 'main'],
];

interface RawRegion {
  name: string;
  role: string;
  bounds: { x: number; y: number; width: number; height: number };
  /** CSS selector for this region container. */
  selector: string;
}

/** Discover page regions and assign elements to them. */
export async function discoverRegions(
  page: Page,
  elements: SnapshotElement[],
): Promise<PageRegion[]> {
  const rawRegions: RawRegion[] = await page.evaluate(() => {
    const regions: RawRegion[] = [];
    const seen = new Set<Element>();

    const buildSelectorFor = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      if (role) return `[role="${role}"]`;
      return tag;
    };

    // 1. Landmark roles
    const ROLE_MAP: Record<string, string> = {
      banner: 'header', navigation: 'nav', main: 'main',
      contentinfo: 'footer', complementary: 'complementary',
      form: 'form', dialog: 'dialog', search: 'search',
    };
    for (const [role, mappedRole] of Object.entries(ROLE_MAP)) {
      const els = document.querySelectorAll(`[role="${role}"]`);
      els.forEach((el, i) => {
        if (seen.has(el)) return;
        seen.add(el);
        const rect = (el as HTMLElement).getBoundingClientRect();
        regions.push({
          name: els.length > 1 ? `${mappedRole}-${i}` : mappedRole,
          role: mappedRole,
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          selector: buildSelectorFor(el),
        });
      });
    }

    // 2. Semantic HTML tags
    const TAG_MAP: Record<string, string> = {
      header: 'header', nav: 'nav', main: 'main',
      footer: 'footer', aside: 'complementary', form: 'form',
      dialog: 'dialog', section: 'section',
    };
    for (const [tag, role] of Object.entries(TAG_MAP)) {
      const els = document.querySelectorAll(tag);
      els.forEach((el, i) => {
        if (seen.has(el)) return;
        seen.add(el);
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        regions.push({
          name: els.length > 1 ? `${role}-${i}` : role,
          role,
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          selector: buildSelectorFor(el),
        });
      });
    }

    // 3. Common class names
    const CLASS_PATTERNS: [string, string][] = [
      ['.header', 'header'], ['.nav, .navbar, .navigation', 'nav'],
      ['.footer', 'footer'], ['.sidebar', 'complementary'],
      ['.chat-area', 'main'], ['.content', 'main'],
    ];
    for (const [sel, role] of CLASS_PATTERNS) {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          regions.push({
            name: `${role}-class`,
            role,
            bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            selector: buildSelectorFor(el),
          });
        });
      } catch { /* invalid selector, skip */ }
    }

    return regions;
  });

  // Assign elements to regions based on bounding-box containment
  return rawRegions.map(region => {
    const elementIds = elements
      .filter(el => el.bounds && isContainedIn(el.bounds, region.bounds))
      .map(el => {
        el.regionName = region.name;
        return el.id;
      });

    return {
      name: region.name,
      role: region.role,
      bounds: region.bounds,
      elementIds,
    };
  });
}

function isContainedIn(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
