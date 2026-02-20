// Template Learning — learn extraction templates from successful extractions,
// store them, and auto-apply on future visits to matching URLs.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ExtensionBridge } from './ext-bridge.js';
import { logGateway } from './gw-log.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionTemplate {
  domain: string;
  urlPattern: string;           // regex pattern for URL matching
  pageType?: string;
  selectors: Record<string, string>;
  alternatives?: Record<string, string[]>; // fallback selectors per field
  schema: Record<string, string>;
  sampleData?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  hitCount: number;
  successCount: number;
  failCount: number;
}

export interface TemplateStore {
  templates: Record<string, ExtractionTemplate>; // keyed by domain
  version: number;
}

// ---------------------------------------------------------------------------
// Template Storage
// ---------------------------------------------------------------------------

const TEMPLATE_DIR = join(homedir(), '.pingos', 'templates');

function ensureDir(): void {
  if (!existsSync(TEMPLATE_DIR)) {
    mkdirSync(TEMPLATE_DIR, { recursive: true });
  }
}

function templatePath(domain: string): string {
  // Sanitize domain for filename
  const safe = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
  return join(TEMPLATE_DIR, `${safe}.json`);
}

/** Load a template for a specific domain. */
export function loadTemplate(domain: string): ExtractionTemplate | null {
  const path = templatePath(domain);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Save a template for a domain. */
export function saveTemplate(template: ExtractionTemplate): void {
  ensureDir();
  writeFileSync(templatePath(template.domain), JSON.stringify(template, null, 2));
}

/** Delete a template for a domain. */
export function deleteTemplate(domain: string): boolean {
  const path = templatePath(domain);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** List all saved templates. */
export function listTemplates(): Array<{ domain: string; urlPattern: string; hitCount: number; successRate: number }> {
  ensureDir();
  const files = readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'));
  const results: Array<{ domain: string; urlPattern: string; hitCount: number; successRate: number }> = [];

  for (const file of files) {
    try {
      const template: ExtractionTemplate = JSON.parse(readFileSync(join(TEMPLATE_DIR, file), 'utf-8'));
      const total = template.successCount + template.failCount;
      results.push({
        domain: template.domain,
        urlPattern: template.urlPattern,
        hitCount: template.hitCount,
        successRate: total > 0 ? template.successCount / total : 0,
      });
    } catch { /* skip corrupt files */ }
  }

  return results;
}

/** Export a template as JSON. */
export function exportTemplate(domain: string): ExtractionTemplate | null {
  return loadTemplate(domain);
}

/** Import a template from JSON. */
export function importTemplate(data: ExtractionTemplate): void {
  if (!data.domain) throw new Error('Template must have a domain');
  data.updatedAt = Date.now();
  saveTemplate(data);
}

// ---------------------------------------------------------------------------
// Template Matching
// ---------------------------------------------------------------------------

/**
 * Find a template that matches the given URL.
 * Returns the template if found and URL matches the stored pattern.
 */
export function findTemplateForUrl(url: string): ExtractionTemplate | null {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return null;
  }

  const template = loadTemplate(domain);
  if (!template) return null;

  // Check URL pattern match
  try {
    const pattern = new RegExp(template.urlPattern);
    if (pattern.test(url)) return template;
  } catch {
    // Invalid regex — try simple string match
    if (url.includes(template.urlPattern)) return template;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Template Learning
// ---------------------------------------------------------------------------

/**
 * Learn a template from a successful extraction on the current page.
 *
 * @param extBridge - Extension bridge for calling device operations
 * @param deviceId - Device/tab to learn from
 * @param extractionResult - The successful extraction result
 * @param schema - The schema that was used
 */
export async function learnTemplate(
  extBridge: ExtensionBridge,
  deviceId: string,
  extractionResult: Record<string, unknown>,
  schema: Record<string, string>,
): Promise<ExtractionTemplate> {
  // Get the current page URL
  let url = '';
  let pageType = 'unknown';
  try {
    const urlResult = await extBridge.callDevice({
      deviceId,
      op: 'getUrl',
      payload: {},
      timeoutMs: 5_000,
    });
    const urlObj = urlResult as Record<string, unknown>;
    url = (urlObj?.data as string) ?? (urlObj?.url as string) ?? '';
    if (typeof url === 'object') {
      url = ((url as Record<string, unknown>)?.url as string) ?? '';
    }
  } catch { /* ignore */ }

  // Try to discover page type
  try {
    const discoverResult = await extBridge.callDevice({
      deviceId,
      op: 'discover',
      payload: {},
      timeoutMs: 10_000,
    });
    const discObj = discoverResult as Record<string, unknown>;
    pageType = (discObj?.pageType as string) ?? 'unknown';
  } catch { /* ignore */ }

  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = 'unknown';
  }

  // Generate URL pattern from the current URL
  const urlPattern = generateUrlPattern(url);

  // Collect alternative selectors from the extraction metadata
  const alternatives: Record<string, string[]> = {};
  const meta = extractionResult._meta as Record<string, unknown> | undefined;
  const selectorsUsed = (meta?.selectors_used as Record<string, string>) ?? {};

  for (const [key, sel] of Object.entries(schema)) {
    const used = selectorsUsed[key];
    const alts = [sel];
    if (used && used !== sel) alts.push(used);
    alternatives[key] = alts;
  }

  // Check for existing template
  const existing = loadTemplate(domain);

  const template: ExtractionTemplate = {
    domain,
    urlPattern,
    pageType,
    selectors: { ...schema, ...selectorsUsed },
    alternatives,
    schema,
    sampleData: extractionResult.result as Record<string, unknown> ?? extractionResult,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    hitCount: existing?.hitCount ?? 0,
    successCount: (existing?.successCount ?? 0) + 1,
    failCount: existing?.failCount ?? 0,
  };

  saveTemplate(template);
  logGateway('[template-learner] learned template', { domain, urlPattern, fields: Object.keys(schema).length });

  return template;
}

/**
 * Apply a template for extraction — use stored selectors.
 * If selectors fail, attempt self-healing.
 */
export async function applyTemplate(
  extBridge: ExtensionBridge,
  deviceId: string,
  template: ExtractionTemplate,
): Promise<{ data: Record<string, unknown>; healed: boolean }> {
  // Try primary selectors
  try {
    const result = await extBridge.callDevice({
      deviceId,
      op: 'extract',
      payload: { schema: template.selectors },
      timeoutMs: 20_000,
    });

    const resObj = result as Record<string, unknown>;
    const resData = (resObj?.result ?? resObj?.data ?? resObj) as Record<string, unknown>;

    // Check if extraction was successful (non-empty)
    const nonEmpty = Object.entries(resData).filter(
      ([k, v]) => !k.startsWith('_') && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0),
    );

    if (nonEmpty.length > 0) {
      // Update hit count
      template.hitCount++;
      template.successCount++;
      template.updatedAt = Date.now();
      saveTemplate(template);
      return { data: resData, healed: false };
    }
  } catch { /* primary selectors failed */ }

  // Try alternative selectors
  if (template.alternatives) {
    for (const [key, alts] of Object.entries(template.alternatives)) {
      for (const alt of alts) {
        if (alt === template.selectors[key]) continue; // skip primary (already tried)
        try {
          const result = await extBridge.callDevice({
            deviceId,
            op: 'extract',
            payload: { schema: { [key]: alt } },
            timeoutMs: 10_000,
          });

          const resObj = result as Record<string, unknown>;
          const resData = (resObj?.result ?? resObj?.data ?? resObj) as Record<string, unknown>;
          if (resData[key] && resData[key] !== '') {
            // Update the template with the working selector
            template.selectors[key] = alt;
            template.updatedAt = Date.now();
            template.hitCount++;
            template.successCount++;
            saveTemplate(template);
            logGateway('[template-learner] self-healed selector', { key, oldSelector: template.selectors[key], newSelector: alt });
          }
        } catch { /* try next alternative */ }
      }
    }

    // Try full extraction with updated selectors
    try {
      const result = await extBridge.callDevice({
        deviceId,
        op: 'extract',
        payload: { schema: template.selectors },
        timeoutMs: 20_000,
      });

      const resObj = result as Record<string, unknown>;
      const resData = (resObj?.result ?? resObj?.data ?? resObj) as Record<string, unknown>;
      return { data: resData, healed: true };
    } catch { /* fall through */ }
  }

  // All selectors failed
  template.hitCount++;
  template.failCount++;
  template.updatedAt = Date.now();
  saveTemplate(template);

  return { data: {}, healed: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a URL pattern from a concrete URL.
 * Replaces numeric path segments with regex wildcards.
 * e.g., "https://example.com/products/123/reviews" → "https://example\\.com/products/\\d+/reviews"
 */
function generateUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    const escapedHost = parsed.hostname.replace(/\./g, '\\.');
    const pathPattern = parsed.pathname
      .replace(/\/\d+/g, '/\\d+')       // numeric segments
      .replace(/\/[a-f0-9]{8,}/g, '/[a-f0-9]+') // hash/UUID segments
      .replace(/\//g, '\\/');
    return `^https?:\\/\\/${escapedHost}${pathPattern}`;
  } catch {
    return url;
  }
}
