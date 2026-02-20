// Multi-Page Extract — orchestrates extraction across paginated content
// Runs on the gateway side, coordinating extension calls for pagination + extraction.

import type { ExtensionBridge } from './ext-bridge.js';

export interface PaginateExtractOptions {
  deviceId: string;
  schema?: Record<string, string>;
  query?: string;
  paginate: boolean;
  maxPages?: number;
  delay?: number;
}

export interface PaginateExtractResult {
  pages: number;
  totalItems: number;
  data: unknown[];
  hasMore: boolean;
  duration_ms: number;
}

/**
 * Wait for the content script to reconnect after page navigation by polling
 * with a lightweight domStable check. Returns true if content script is alive.
 */
async function waitForContentScript(
  extBridge: ExtensionBridge,
  deviceId: string,
  maxWaitMs: number = 10_000,
): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 1000;
  while (Date.now() - start < maxWaitMs) {
    try {
      await extBridge.callDevice({
        deviceId,
        op: 'wait',
        payload: { condition: 'domStable', timeoutMs: 3000 },
        timeoutMs: 5_000,
      });
      return true; // content script is alive
    } catch {
      await sleep(pollInterval);
    }
  }
  return false;
}

/**
 * Extract data across multiple pages by combining extract + paginate operations.
 *
 * Flow:
 * 1. Extract from current page
 * 2. Detect pagination
 * 3. If hasNext: navigate to next page, wait, extract again
 * 4. Accumulate and deduplicate results
 * 5. Repeat until maxPages or no more pages
 */
export async function paginateExtract(
  extBridge: ExtensionBridge,
  opts: PaginateExtractOptions,
): Promise<PaginateExtractResult> {
  const {
    deviceId,
    schema,
    query,
    maxPages = 10,
    delay = 1000,
  } = opts;

  const startMs = Date.now();
  const allData: unknown[] = [];
  const seenHashes = new Set<string>();
  let pageCount = 0;
  let hasMore = false;

  for (let page = 0; page < maxPages; page++) {
    // 1. Extract from current page (with retry for bfcache recovery after navigation)
    const extractPayload: Record<string, unknown> = {};
    if (schema) extractPayload.schema = schema;
    if (query) extractPayload.query = query;

    let extractResult: unknown;
    const maxRetries = page === 0 ? 1 : 4; // more retries after navigation
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        extractResult = await extBridge.callDevice({
          deviceId,
          op: 'extract',
          payload: extractPayload,
          timeoutMs: 20_000,
        });
        break; // success
      } catch (err) {
        if (attempt < maxRetries - 1) {
          // Exponential backoff: 2s, 4s, 8s
          await sleep(2000 * Math.pow(2, attempt));
        } else {
          throw err; // all retries exhausted
        }
      }
    }

    // Parse extraction results
    const items = parseExtractItems(extractResult);
    let newItemCount = 0;
    for (const item of items) {
      const hash = hashItem(item);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        allData.push(item);
        newItemCount++;
      }
    }
    pageCount++;

    // If no new items on this page, we may have looped
    if (newItemCount === 0 && page > 0) {
      break;
    }

    // 2. Check if there's a next page
    if (page < maxPages - 1) {
      const paginateResult = await extBridge.callDevice({
        deviceId,
        op: 'paginate',
        payload: { action: 'detect' },
        timeoutMs: 10_000,
      });

      const paginateData = paginateResult as Record<string, unknown>;
      const innerData = (paginateData?.data ?? paginateData) as Record<string, unknown>;
      const found = innerData?.found ?? paginateData?.found;
      const paginationHasNext = innerData?.hasNext ?? paginateData?.hasNext;

      if (!found || !paginationHasNext) {
        break;
      }

      // 3. Navigate to next page.
      // Prefer using `navigate` via the next URL (goes through background.ts,
      // properly handles page load) over `paginate next` (clicks the link in
      // the content script, which destroys the port on full-page navigation).
      const nextUrl = (innerData?.nextUrl ?? paginateData?.nextUrl) as string | undefined;
      let navigationSucceeded = false;
      let usedClickNav = false; // click-based nav is less predictable

      if (nextUrl) {
        // Use navigate — this goes through background.ts which handles
        // chrome.tabs.update and waits for page load completion.
        try {
          await extBridge.callDevice({
            deviceId,
            op: 'navigate',
            payload: { url: nextUrl },
            timeoutMs: 20_000,
          });
          navigationSucceeded = true;
        } catch {
          // navigate failure — stop pagination
        }
      } else {
        // Fallback: use paginate next (click). For link-based pagination,
        // clicking triggers a full page navigation which destroys the content
        // script. The bfcache/IO error is expected — it means navigation
        // succeeded.
        usedClickNav = true;
        try {
          const nextResult = await extBridge.callDevice({
            deviceId,
            op: 'paginate',
            payload: { action: 'next' },
            timeoutMs: 15_000,
          });

          const nextData = nextResult as Record<string, unknown>;
          if (nextData?.success || (nextData?.data as Record<string, unknown>)?.action) {
            navigationSucceeded = true;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('back/forward cache') || errMsg.includes('message channel closed') ||
              errMsg.includes('io_error') || errMsg.includes('I/O error') || errMsg.includes('EIO')) {
            navigationSucceeded = true; // navigation happened, port closed as expected
          }
        }
      }

      if (!navigationSucceeded) break;

      // 4. Wait for content script to reconnect after full-page navigation.
      // Navigation destroys the old content script; the new page's content
      // script needs time to load and reconnect to the extension background.
      // Click-based nav is less predictable, so use a longer initial wait.
      const baseWait = usedClickNav ? Math.max(delay, 4000) : Math.max(delay, 2000);
      await sleep(baseWait);

      // Poll until the content script is alive, with a generous timeout.
      // This replaces the fixed-retry domStable loop with adaptive polling.
      const reconnected = await waitForContentScript(extBridge, deviceId, 10_000);
      if (!reconnected) {
        // Content script didn't reconnect in time — stop pagination.
        // Data collected so far is still returned.
        break;
      }
    } else {
      // Check if there are more pages beyond our limit
      try {
        const paginateResult = await extBridge.callDevice({
          deviceId,
          op: 'paginate',
          payload: { action: 'detect' },
          timeoutMs: 10_000,
        });
        const paginateData = paginateResult as Record<string, unknown>;
        const innerPData = (paginateData?.data ?? paginateData) as Record<string, unknown>;
        hasMore = !!(innerPData?.hasNext ?? paginateData?.hasNext);
      } catch {
        // ignore — we've hit our limit anyway
      }
    }
  }

  return {
    pages: pageCount,
    totalItems: allData.length,
    data: allData,
    hasMore,
    duration_ms: Date.now() - startMs,
  };
}

/**
 * Parse extraction results into an array of items for deduplication.
 */
function parseExtractItems(result: unknown): unknown[] {
  if (!result) return [];

  const obj = result as Record<string, unknown>;

  // If result has a `data` wrapper
  const data = obj.data ?? obj.result ?? obj;
  if (!data || typeof data !== 'object') return [data];

  const dataObj = data as Record<string, unknown>;

  // If data has `result` (schema extraction), inspect it
  if (dataObj.result && typeof dataObj.result === 'object') {
    const resultObj = dataObj.result as Record<string, unknown>;
    // Check if any field is an array — that's our items
    for (const [, value] of Object.entries(resultObj)) {
      if (Array.isArray(value) && value.length > 0) {
        // If it's an array of strings, each string is an item
        if (typeof value[0] === 'string') {
          return value.map((v, i) => {
            // Build an item from all array fields at this index
            const item: Record<string, unknown> = {};
            for (const [k, arr] of Object.entries(resultObj)) {
              if (Array.isArray(arr)) {
                item[k] = arr[i] ?? '';
              } else {
                item[k] = arr;
              }
            }
            return item;
          });
        }
        return value;
      }
    }
    // No arrays — single result item
    return [resultObj];
  }

  // If data has items/query response
  if (dataObj.items && Array.isArray(dataObj.items)) {
    return dataObj.items;
  }

  // If data itself is an object with extracted fields
  return [dataObj];
}

/**
 * Hash an extracted item for deduplication.
 */
function hashItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null) return String(item);

  // Create a stable string representation
  const entries = Object.entries(item as Record<string, unknown>)
    .filter(([k]) => !k.startsWith('_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return entries.join('|');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
