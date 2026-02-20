// @pingdev/std — CDP Fallback
// When the extension content script fails (EIO), fall back to Chrome DevTools
// Protocol to execute operations directly via Runtime.evaluate.

import { logGateway } from './gw-log.js';

const CDP_PORT = parseInt(process.env.CDP_PORT || '18800', 10);
const CDP_HOST = process.env.CDP_HOST || 'localhost';

interface CDPTarget {
  id: string;
  url: string;
  title: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

/** Resolve a PingOS deviceId (e.g. "chrome-1234") to a CDP target. */
async function findCDPTarget(deviceId: string): Promise<CDPTarget | null> {
  // deviceId format: "chrome-<tabId>"
  const tabIdStr = deviceId.replace('chrome-', '');
  try {
    const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
    if (!res.ok) return null;
    const targets = (await res.json()) as CDPTarget[];
    // We can't match by tabId directly since CDP uses different IDs.
    // Return null — we'll use a different approach via the extension's tab URL.
    return targets.find(t => t.type === 'page') ?? null;
  } catch {
    return null;
  }
}

/** Find CDP target by URL match (more reliable than tab ID matching). */
async function findCDPTargetByUrl(url: string): Promise<CDPTarget | null> {
  try {
    const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
    if (!res.ok) return null;
    const targets = (await res.json()) as CDPTarget[];
    // Exact match first, then prefix match
    const exact = targets.find(t => t.type === 'page' && t.url === url);
    if (exact) return exact;
    // Prefix match (handles query params, redirects)
    const baseUrl = url.split('?')[0].split('#')[0];
    return targets.find(t => t.type === 'page' && t.url.startsWith(baseUrl)) ?? null;
  } catch {
    return null;
  }
}

/** Execute a JavaScript expression on a CDP target via HTTP endpoint. */
async function cdpEvaluate(targetId: string, expression: string): Promise<unknown> {
  // Use CDP HTTP API via /json/protocol is not directly available, so we use
  // a WebSocket-based approach with a simple one-shot message.
  const WebSocket = (await import('ws')).default;
  const wsUrl = `ws://${CDP_HOST}:${CDP_PORT}/devtools/page/${targetId}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('CDP evaluate timeout'));
    }, 15_000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
          awaitPromise: true,
          timeout: 10_000,
        },
      }));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          if (msg.result?.exceptionDetails) {
            reject(new Error(msg.result.exceptionDetails.text || 'CDP evaluation error'));
          } else {
            resolve(msg.result?.result?.value);
          }
        }
      } catch (e) {
        clearTimeout(timeout);
        ws.close();
        reject(e);
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** Build a CDP expression for extracting page data (zero-config extract). */
function buildExtractExpression(payload: Record<string, unknown>): string {
  const strategy = payload?.strategy as string;
  if (strategy === 'structured') {
    return `(function() {
      const meta = {};
      const title = document.querySelector('title');
      if (title) meta.title = title.textContent.trim();
      const desc = document.querySelector('meta[name="description"]');
      if (desc) meta.description = desc.getAttribute('content');
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) meta.canonical = canonical.getAttribute('href');
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) meta.ogTitle = ogTitle.getAttribute('content');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) meta.ogDescription = ogDesc.getAttribute('content');
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) meta.ogImage = ogImage.getAttribute('content');
      // JSON-LD
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      if (jsonLd.length > 0) {
        meta.jsonLd = [];
        jsonLd.forEach(el => { try { meta.jsonLd.push(JSON.parse(el.textContent)); } catch {} });
      }
      return { data: meta, _meta: { strategy: 'cdp-structured', confidence: 0.5 } };
    })()`;
  }

  // Zero-config: extract title, description, main text
  return `(function() {
    const data = {};
    const title = document.querySelector('title');
    if (title) data.title = title.textContent.trim();
    const desc = document.querySelector('meta[name="description"]');
    if (desc) data.description = desc.getAttribute('content');
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) data.canonical = canonical.getAttribute('href');
    const h1 = document.querySelector('h1');
    if (h1) data.heading = h1.textContent.trim();
    // Get main content text
    const main = document.querySelector('main, article, [role="main"], #content, .content');
    if (main) data.mainText = main.textContent.trim().substring(0, 2000);
    return { data, _meta: { strategy: 'cdp-fallback', confidence: 0.4 } };
  })()`;
}

/** Build CDP expression for discover. */
function buildDiscoverExpression(): string {
  return `(function() {
    const forms = document.querySelectorAll('form');
    const tables = document.querySelectorAll('table');
    const inputs = document.querySelectorAll('input, textarea, select');
    const links = document.querySelectorAll('a[href]');
    let pageType = 'content';
    let confidence = 0.3;
    if (tables.length > 0) { pageType = 'table'; confidence = 0.5; }
    if (forms.length > 0 && inputs.length > 2) { pageType = 'form'; confidence = 0.5; }
    if (inputs.length > 0 && document.querySelector('input[type="search"], input[name*="search"], input[name*="query"]')) {
      pageType = 'search'; confidence = 0.5;
    }
    const schemas = [];
    if (tables.length > 0) schemas.push({ name: 'table_data', fields: { table: 'table' } });
    return {
      pageType, confidence,
      title: document.title,
      url: location.href,
      schemas,
      metadata: { forms: forms.length, tables: tables.length, inputs: inputs.length, links: links.length },
      _meta: { strategy: 'cdp-fallback' },
    };
  })()`;
}

/** Build CDP expression for table extract. */
function buildTableExpression(): string {
  return `(function() {
    const tables = [];
    document.querySelectorAll('table').forEach((table, idx) => {
      if (idx >= 5) return; // limit
      const headers = [];
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (headerRow) {
        headerRow.querySelectorAll('th, td').forEach(cell => headers.push(cell.textContent.trim()));
      }
      const rows = [];
      const bodyRows = table.querySelectorAll('tbody tr, tr');
      bodyRows.forEach((row, ri) => {
        if (ri === 0 && headers.length > 0) return; // skip header row
        if (ri >= 50) return; // limit
        const obj = {};
        row.querySelectorAll('td, th').forEach((cell, ci) => {
          const key = headers[ci] || ('col_' + ci);
          obj[key] = cell.textContent.trim();
        });
        if (Object.keys(obj).length > 0) rows.push(obj);
      });
      tables.push({ headers, rows, rowCount: rows.length });
    });
    if (tables.length === 0) {
      // Try list-based tables
      const lists = document.querySelectorAll('ul, ol');
      lists.forEach((list, idx) => {
        if (idx >= 3) return;
        const items = [];
        list.querySelectorAll('li').forEach((li, i) => {
          if (i >= 30) return;
          items.push({ col_0: li.textContent.trim().substring(0, 500) });
        });
        if (items.length > 2) tables.push({ headers: ['col_0'], rows: items, rowCount: items.length });
      });
    }
    return { tables, _meta: { strategy: 'cdp-fallback' } };
  })()`;
}

/** Build CDP expression for assert. */
function buildAssertExpression(assertions: Array<{ type: string; selector: string }>): string {
  const assertionsJson = JSON.stringify(assertions);
  return `(function() {
    const assertions = ${assertionsJson};
    const results = assertions.map(a => {
      if (a.type === 'exists') {
        const el = document.querySelector(a.selector);
        return { assertion: a, passed: el !== null, actual: el ? 'exists' : 'not found' };
      }
      if (a.type === 'visible') {
        const el = document.querySelector(a.selector);
        const vis = el ? (el.offsetParent !== null || getComputedStyle(el).display !== 'none') : false;
        return { assertion: a, passed: vis, actual: vis ? 'visible' : 'not visible' };
      }
      return { assertion: a, passed: false, actual: 'unknown assertion type' };
    });
    return { passed: results.every(r => r.passed), results };
  })()`;
}

/** Build CDP expression for semantic extract. */
function buildSemanticExpression(query: string): string {
  return `(function() {
    // Get all visible text content from major containers
    const containers = document.querySelectorAll('main, article, section, [role="main"], .content, #content, .post, .entry');
    const items = [];
    const seen = new Set();
    function addText(el) {
      const text = el.textContent.trim().substring(0, 500);
      if (text.length > 20 && !seen.has(text)) {
        seen.add(text);
        items.push(text);
      }
    }
    if (containers.length > 0) {
      containers.forEach(c => {
        c.querySelectorAll('p, h1, h2, h3, li, td, .title, .headline').forEach(el => {
          if (items.length < 20) addText(el);
        });
      });
    }
    // Fallback: just get body text chunks
    if (items.length === 0) {
      document.querySelectorAll('p, h1, h2, h3, h4, li').forEach(el => {
        if (items.length < 20) addText(el);
      });
    }
    return { query: ${JSON.stringify(query)}, items, method: 'cdp-fallback', _meta: { strategy: 'cdp-fallback' } };
  })()`;
}

export interface CDPFallbackResult {
  ok: boolean;
  result: unknown;
  _cdpFallback: boolean;
}

/**
 * Attempt to execute an operation via CDP when the content script fails.
 * Returns null if CDP fallback is not possible.
 */
export async function cdpFallback(
  deviceUrl: string | undefined,
  op: string,
  payload: Record<string, unknown> | undefined,
): Promise<CDPFallbackResult | null> {
  if (!deviceUrl) return null;

  const target = await findCDPTargetByUrl(deviceUrl);
  if (!target) {
    logGateway('[cdp-fallback] no CDP target for URL', { url: deviceUrl });
    return null;
  }

  logGateway('[cdp-fallback] attempting', { op, targetId: target.id, url: deviceUrl });

  let expression: string;
  switch (op) {
    case 'extract':
      expression = buildExtractExpression(payload ?? {});
      break;
    case 'discover':
      expression = buildDiscoverExpression();
      break;
    case 'table':
      expression = buildTableExpression();
      break;
    case 'assert':
      expression = buildAssertExpression(
        (payload?.assertions as Array<{ type: string; selector: string }>) ?? [],
      );
      break;
    case 'recon':
      expression = `(function() {
        const actions = [];
        document.querySelectorAll('a[href]').forEach((a, i) => {
          if (i < 20) actions.push({ type: 'link', selector: 'a', label: a.textContent.trim().substring(0, 50), purpose: 'navigate', enabled: true });
        });
        document.querySelectorAll('button, input[type="submit"]').forEach((b, i) => {
          if (i < 10) actions.push({ type: 'button', selector: 'button', label: b.textContent?.trim()?.substring(0, 50) || b.getAttribute('value') || '', purpose: 'action', enabled: true });
        });
        const forms = [];
        document.querySelectorAll('form').forEach((f, i) => {
          if (i < 5) {
            const inputs = [];
            f.querySelectorAll('input, textarea, select').forEach(inp => {
              inputs.push({ type: inp.tagName.toLowerCase(), name: inp.getAttribute('name'), id: inp.id });
            });
            forms.push({ action: f.action, method: f.method, inputs });
          }
        });
        return {
          url: location.href, title: document.title,
          meta: { description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '' },
          structure: {
            hasHeader: !!document.querySelector('header'),
            hasNav: !!document.querySelector('nav'),
            hasMain: !!document.querySelector('main'),
            hasSidebar: !!document.querySelector('aside, [role="complementary"]'),
            hasFooter: !!document.querySelector('footer'),
            hasModal: !!document.querySelector('[role="dialog"], .modal'),
          },
          actions, forms,
          _meta: { strategy: 'cdp-fallback' },
        };
      })()`;
      break;
    default:
      // CDP fallback not supported for this operation
      return null;
  }

  // Also handle semantic extract (extract with query)
  if (op === 'extract' && payload?.query) {
    expression = buildSemanticExpression(payload.query as string);
  }

  try {
    const result = await cdpEvaluate(target.id, expression);
    logGateway('[cdp-fallback] success', { op, targetId: target.id });
    return { ok: true, result, _cdpFallback: true };
  } catch (err) {
    logGateway('[cdp-fallback] failed', { op, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
