/**
 * Dynamic content detection — identifies page areas that change over time.
 */
import type { Page } from 'playwright';
import type { DynamicArea } from '../types.js';

/** Default observation time in milliseconds. */
const OBSERVE_DURATION_MS = 3000;

/** Detect dynamic content areas using MutationObserver and known patterns. */
export async function detectDynamicAreas(
  page: Page,
  observeDurationMs = OBSERVE_DURATION_MS,
): Promise<DynamicArea[]> {
  const areas: DynamicArea[] = await page.evaluate((durationMs: number) => {
    return new Promise<DynamicArea[]>((resolve) => {
      const results: DynamicArea[] = [];
      const mutationCounts = new Map<Element, { count: number; types: Set<string> }>();

      // Track mutations on the document
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Walk up to find a meaningful container (not body/html)
          let target = mutation.target as Element;
          if (target.nodeType === Node.TEXT_NODE) {
            target = target.parentElement!;
          }
          if (!target || target === document.body || target === document.documentElement) continue;

          // Walk up to a container with an id, role, or class
          let container = target;
          for (let i = 0; i < 5; i++) {
            if (container.id || container.getAttribute('role') || container.classList.length > 0) break;
            if (container.parentElement && container.parentElement !== document.body) {
              container = container.parentElement;
            } else break;
          }

          const entry = mutationCounts.get(container) ?? { count: 0, types: new Set<string>() };
          entry.count++;
          entry.types.add(mutation.type);
          mutationCounts.set(container, entry);
        }
      });

      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();

        // Convert mutation map to DynamicAreas
        for (const [el, data] of mutationCounts) {
          if (data.count < 2) continue; // filter noise
          results.push({
            name: describeDynamicArea(el),
            selector: buildSelector(el),
            contentType: classifyDynamic(el, data.types),
            mutationHints: Array.from(data.types),
          });
        }

        // Also scan for known dynamic patterns (aria-live, role=log, etc.)
        const liveAreas = document.querySelectorAll(
          '[aria-live], [role="log"], [role="status"], [role="alert"], ' +
          '[role="progressbar"], [aria-busy], [data-loading], ' +
          '.loading, .spinner',
        );
        const seenSelectors = new Set(results.map(r => r.selector));

        liveAreas.forEach((el) => {
          const sel = buildSelector(el);
          if (seenSelectors.has(sel)) return;
          seenSelectors.add(sel);

          results.push({
            name: describeDynamicArea(el),
            selector: sel,
            contentType: classifyStaticPattern(el),
            mutationHints: [],
          });
        });

        resolve(results);
      }, durationMs);

      function buildSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const role = el.getAttribute('role');
        if (role) return `[role="${role}"]`;
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
        const tag = el.tagName.toLowerCase();
        const cls = el.classList[0];
        return cls ? `${tag}.${cls}` : tag;
      }

      function describeDynamicArea(el: Element): string {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        const role = el.getAttribute('role');
        if (role) return role;
        const id = el.id;
        if (id) return id;
        return el.tagName.toLowerCase() + '-dynamic';
      }

      function classifyDynamic(el: Element, types: Set<string>): string {
        const role = el.getAttribute('role');
        if (role === 'log' || role === 'status') return 'response-output';
        if (role === 'alert') return 'notification';
        const ariaLive = el.getAttribute('aria-live');
        if (ariaLive === 'polite' || ariaLive === 'assertive') return 'live-update';
        if (el.classList.contains('loading') || el.classList.contains('spinner')) return 'loading-indicator';
        if (types.has('childList') && types.has('characterData')) return 'response-output';
        if (types.has('childList')) return 'live-update';
        return 'live-update';
      }

      function classifyStaticPattern(el: Element): string {
        const role = el.getAttribute('role');
        if (role === 'log') return 'response-output';
        if (role === 'status') return 'response-output';
        if (role === 'alert') return 'notification';
        if (role === 'progressbar') return 'loading-indicator';
        if (el.getAttribute('aria-busy') === 'true' || el.hasAttribute('data-loading')) return 'loading-indicator';
        if (el.classList.contains('loading') || el.classList.contains('spinner')) return 'loading-indicator';
        const ariaLive = el.getAttribute('aria-live');
        if (ariaLive) return 'live-update';
        return 'live-update';
      }
    });
  }, observeDurationMs);

  return areas;
}
