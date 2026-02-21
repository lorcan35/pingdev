/**
 * Tab-as-a-Function — Function Registry
 *
 * Auto-registers PingApps and browser tabs as callable functions.
 * Each tab becomes a set of named functions with typed parameters.
 *
 * Generic tabs get: extract, click, type, read, eval
 * PingApps get their specific endpoints exposed as functions.
 */

import type { FunctionDef, FunctionParam } from './types.js';
import type { ExtensionBridge } from './ext-bridge.js';

// ---------------------------------------------------------------------------
// Generic tab functions available on every tab
// ---------------------------------------------------------------------------

const GENERIC_TAB_FUNCTIONS: Omit<FunctionDef, 'name' | 'tab'>[] = [
  {
    description: 'Extract structured data from the page using a CSS-selector schema',
    params: [
      { name: 'schema', type: 'object', required: true, description: 'Map of field names to CSS selectors' },
    ],
    returns: 'object — extracted data matching the schema',
  },
  {
    description: 'Click an element on the page',
    params: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector of the element to click' },
    ],
    returns: 'object — click result',
  },
  {
    description: 'Type text into an input element',
    params: [
      { name: 'text', type: 'string', required: true, description: 'Text to type' },
      { name: 'selector', type: 'string', required: false, description: 'CSS selector (optional, types into focused element)' },
    ],
    returns: 'object — type result',
  },
  {
    description: 'Read text content of an element',
    params: [
      { name: 'selector', type: 'string', required: true, description: 'CSS selector of the element to read' },
    ],
    returns: 'string — text content',
  },
  {
    description: 'Evaluate JavaScript in the page context',
    params: [
      { name: 'expression', type: 'string', required: true, description: 'JavaScript expression to evaluate' },
    ],
    returns: 'unknown — evaluation result',
  },
  {
    description: 'Auto-detect page type and generate extraction schemas',
    params: [],
    returns: 'object — page type, confidence, schemas',
  },
];

const GENERIC_OP_NAMES = ['extract', 'click', 'type', 'read', 'eval', 'discover'];

// ---------------------------------------------------------------------------
// Function Registry
// ---------------------------------------------------------------------------

interface RegisteredApp {
  tabId: string;
  appName?: string;         // e.g. "gmail" — if it's a PingApp
  functions: FunctionDef[];
}

interface GeneratedApp {
  appName: string;
  domain?: string;
  functions: FunctionDef[];
}

export interface PingAppFunctionDef {
  app: string;
  domain: string;
  functions: Array<{
    name: string;
    description: string;
    params: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  }>;
}

export interface ResolveFunctionResult {
  matched: boolean;
  qualifiedName?: string;
  available: string[];
  suggestion?: string;
  ambiguous?: boolean;
}

export class FunctionRegistry {
  private apps = new Map<string, RegisteredApp>();
  private generatedApps = new Map<string, GeneratedApp>();
  private extBridge: ExtensionBridge;
  private pingAppDefs: PingAppFunctionDef[] = [];

  constructor(extBridge: ExtensionBridge) {
    this.extBridge = extBridge;
  }

  /** Register PingApp function definitions (from app-routes). */
  registerPingApps(defs: PingAppFunctionDef[]): void {
    this.pingAppDefs = defs;
  }

  /** Register generated app functions from /v1/apps/generate output. */
  registerGeneratedApp(
    app: Record<string, unknown>,
    sourceUrl?: string,
  ): void {
    const appName = this.toSafeAppName(String(app.name ?? '').trim() || this.deriveAppName(sourceUrl ?? '', undefined));
    if (!appName) return;

    const domain = this.toDomain(String(app.url ?? sourceUrl ?? '').trim() || sourceUrl || '');
    const functions = this.buildGeneratedFunctions(appName, app);
    this.generatedApps.set(appName, { appName, domain, functions });
  }

  /** Refresh the registry from currently connected tabs. */
  refresh(): void {
    this.apps.clear();
    const tabClients = this.extBridge.listSharedTabs();
    for (const { tabs } of tabClients) {
      for (const tab of tabs ?? []) {
        const appName = this.deriveAppName(tab.url, tab.title);
        const functions = this.buildFunctions(tab.deviceId, appName);

        // Merge PingApp-specific functions if this tab matches a registered app
        const pingApp = this.pingAppDefs.find(
          (def) => tab.url?.toLowerCase().includes(def.domain),
        );
        if (pingApp) {
          for (const fn of pingApp.functions) {
            // Only add if not already covered by generic ops
            const qualifiedName = `${appName}.${fn.name}`;
            if (!functions.some((f) => f.name === qualifiedName)) {
              functions.push({
                name: qualifiedName,
                description: fn.description,
                params: fn.params.map((p) => ({
                  name: p.name,
                  type: (p.type || 'string') as 'string' | 'number' | 'boolean' | 'object',
                  required: p.required,
                  description: p.description,
                })),
                tab: tab.deviceId,
              });
            }
          }
        }

        this.apps.set(appName, {
          tabId: tab.deviceId,
          appName,
          functions,
        });
      }
    }
  }

  /** List all callable functions across all tabs. */
  listAll(): FunctionDef[] {
    this.refresh();
    const result: FunctionDef[] = [];
    for (const app of this.apps.values()) {
      result.push(...app.functions);
    }
    for (const generated of this.generatedApps.values()) {
      for (const fn of generated.functions) {
        if (!result.some((x) => x.name === fn.name)) result.push(fn);
      }
    }
    return result;
  }

  /** List functions for a specific app/tab. */
  listForApp(appName: string): FunctionDef[] | null {
    this.refresh();
    const app = this.apps.get(appName);
    if (app) return app.functions;
    const generated = this.generatedApps.get(appName);
    return generated ? generated.functions : null;
  }

  /** Describe a specific function. */
  describe(qualifiedName: string): FunctionDef | null {
    this.refresh();
    for (const app of this.apps.values()) {
      const fn = app.functions.find((f) => f.name === qualifiedName);
      if (fn) return fn;
    }
    for (const app of this.generatedApps.values()) {
      const fn = app.functions.find((f) => f.name === qualifiedName);
      if (fn) return fn;
    }
    return null;
  }

  /** Resolve a function name for an app using exact + fuzzy matching. */
  resolveFunction(appName: string, requestedName: string): ResolveFunctionResult {
    this.refresh();

    const app = this.apps.get(appName);
    const generated = this.generatedApps.get(appName);
    const functions = (app?.functions ?? generated?.functions ?? []);
    const available = functions.map((fn) => fn.name.split('.').slice(1).join('.')).filter(Boolean);

    if (!functions.length) {
      return { matched: false, available };
    }

    const requestedOp = requestedName.includes('.')
      ? requestedName.split('.').slice(1).join('.')
      : requestedName;

    const exact = functions.find((fn) => fn.name === `${appName}.${requestedOp}` || fn.name === requestedName);
    if (exact) {
      return { matched: true, qualifiedName: exact.name, available };
    }

    const fuzzy = this.findFuzzyMatches(requestedOp, available);
    if (fuzzy.matches.length === 1) {
      return { matched: true, qualifiedName: `${appName}.${fuzzy.matches[0]}`, available, suggestion: fuzzy.suggestion };
    }

    return {
      matched: false,
      available,
      suggestion: fuzzy.suggestion,
      ambiguous: fuzzy.matches.length > 1,
    };
  }

  /** Get the tab/device ID for an app name. */
  getTabId(appName: string): string | null {
    this.refresh();
    const app = this.apps.get(appName);
    if (app) return app.tabId;
    const generated = this.generatedApps.get(appName);
    if (!generated) return null;
    return this.findTabIdByDomain(generated.domain) ?? this.findFirstTabId();
  }

  /**
   * Call a function by qualified name.
   * Returns the result from the extension bridge.
   */
  async call(qualifiedName: string, params: Record<string, unknown>): Promise<unknown> {
    this.refresh();

    // Parse "appName.functionOp" format
    const dotIdx = qualifiedName.indexOf('.');
    if (dotIdx === -1) {
      throw new Error(`Invalid function name "${qualifiedName}": expected "app.operation" format`);
    }
    const appName = qualifiedName.slice(0, dotIdx);
    const opName = qualifiedName.slice(dotIdx + 1);

    const app = this.apps.get(appName);
    const generated = this.generatedApps.get(appName);
    if (!app && !generated) {
      throw new Error(`App "${appName}" not found. Available: ${[...this.apps.keys(), ...this.generatedApps.keys()].join(', ')}`);
    }

    const fn = (app?.functions ?? generated?.functions ?? []).find((f) => f.name === qualifiedName);
    if (!fn) {
      throw new Error(
        `Function "${qualifiedName}" not found. Available: ${(app?.functions ?? generated?.functions ?? []).map((f) => f.name).join(', ')}`,
      );
    }

    // Validate required params
    for (const param of fn.params) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter "${param.name}" for ${qualifiedName}`);
      }
    }

    const tabId = app?.tabId
      ?? this.findTabIdByDomain(generated?.domain)
      ?? this.findFirstTabId();
    if (!tabId) {
      throw new Error(`No connected browser tab available for app "${appName}"`);
    }

    return this.extBridge.callDevice({
      deviceId: tabId,
      op: opName,
      payload: params,
      timeoutMs: 20_000,
    });
  }

  /**
   * Execute a batch of function calls in sequence.
   */
  async batch(calls: Array<{ function: string; params: Record<string, unknown> }>): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const c of calls) {
      const result = await this.call(c.function, c.params);
      results.push(result);
    }
    return results;
  }

  // ---- internal helpers ----

  private deriveAppName(url: string, title?: string): string {
    try {
      const hostname = new URL(url).hostname;
      // Strip www. and take the first part of the domain
      const clean = hostname.replace(/^www\./, '');
      const parts = clean.split('.');
      // Use the primary domain part (e.g., "gmail" from "mail.google.com")
      if (parts.length >= 3 && parts[parts.length - 2] === 'google') {
        return parts[0]; // mail, docs, sheets, etc.
      }
      return parts[0]; // amazon, github, reddit, etc.
    } catch {
      // Fallback to title-based name
      if (title) {
        return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      }
      return 'tab';
    }
  }

  private buildFunctions(deviceId: string, appName: string): FunctionDef[] {
    return GENERIC_OP_NAMES.map((op, i) => ({
      ...GENERIC_TAB_FUNCTIONS[i],
      name: `${appName}.${op}`,
      tab: deviceId,
    }));
  }

  private buildGeneratedFunctions(appName: string, app: Record<string, unknown>): FunctionDef[] {
    const base: FunctionDef[] = [
      {
        name: `${appName}.navigate`,
        description: 'Navigate to a URL',
        params: [{ name: 'url', type: 'string', required: true, description: 'URL to open' }],
      },
      {
        name: `${appName}.extract`,
        description: 'Extract structured data from the page',
        params: [{ name: 'schema', type: 'object', required: true, description: 'Field-to-selector map' }],
      },
      {
        name: `${appName}.screenshot`,
        description: 'Capture a screenshot of the page',
        params: [],
      },
    ];

    const actions = Array.isArray(app.actions) ? app.actions : [];
    for (const action of actions) {
      if (!action || typeof action !== 'object') continue;
      const a = action as Record<string, unknown>;
      const actionName = String(a.name ?? '').trim();
      const op = String(a.op ?? '').trim();
      if (!actionName || !op) continue;
      const safeActionName = actionName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!safeActionName) continue;
      const qualified = `${appName}.${safeActionName}`;
      if (base.some((f) => f.name === qualified)) continue;
      const params: FunctionParam[] = [];
      if (typeof a.selector === 'string' && a.selector.trim()) {
        params.push({ name: 'selector', type: 'string', required: false, description: 'Optional selector override' });
      }
      if (typeof a.value === 'string' && a.value.includes('{{')) {
        params.push({ name: 'value', type: 'string', required: false, description: 'Template value override' });
      }
      base.push({
        name: qualified,
        description: `Generated action: ${op}`,
        params,
      });
    }

    return base;
  }

  private toDomain(url: string): string | undefined {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  private toSafeAppName(name: string): string {
    const clean = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return clean || 'site-app';
  }

  private findTabIdByDomain(domain?: string): string | null {
    if (!domain) return null;
    const lower = domain.toLowerCase();
    for (const { tabs } of this.extBridge.listSharedTabs()) {
      for (const tab of tabs ?? []) {
        const url = String(tab.url ?? '').toLowerCase();
        if (url.includes(lower)) return tab.deviceId;
      }
    }
    return null;
  }

  private findFirstTabId(): string | null {
    for (const { tabs } of this.extBridge.listSharedTabs()) {
      if (tabs?.length) return tabs[0].deviceId;
    }
    return null;
  }

  private normalizeFunctionName(name: string): string {
    const noPrefix = name.trim().replace(/^get/i, '');
    return noPrefix.toLowerCase().replace(/[_\-\s]+/g, '').replace(/[^a-z0-9]/g, '');
  }

  private stemToken(token: string): string {
    const t = token.toLowerCase();
    if (t.endsWith('ies') && t.length > 3) return `${t.slice(0, -3)}y`;
    if (t.endsWith('s') && t.length > 3) return t.slice(0, -1);
    return t;
  }

  private tokenizeFunctionName(name: string): string[] {
    const spaced = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[._-]+/g, ' ')
      .trim();
    return spaced
      .split(/\s+/)
      .map((tok) => this.stemToken(tok))
      .filter((tok) => tok && tok !== 'get');
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array<number>(b.length + 1);
    const curr = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost,
        );
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  private scoreFunctionSimilarity(query: string, candidate: string): number {
    const qNorm = this.normalizeFunctionName(query);
    const cNorm = this.normalizeFunctionName(candidate);
    if (!qNorm || !cNorm) return 0;
    if (qNorm === cNorm) return 1;
    if (qNorm.includes(cNorm) || cNorm.includes(qNorm)) return 0.92;

    const qTokens = this.tokenizeFunctionName(query);
    const cTokens = this.tokenizeFunctionName(candidate);
    const qSet = new Set(qTokens);
    const cSet = new Set(cTokens);
    const overlap = [...qSet].filter((t) => cSet.has(t)).length;
    const tokenScore = (qSet.size + cSet.size) > 0 ? (2 * overlap) / (qSet.size + cSet.size) : 0;

    const maxLen = Math.max(qNorm.length, cNorm.length);
    const charScore = maxLen > 0 ? 1 - (this.levenshteinDistance(qNorm, cNorm) / maxLen) : 0;

    return Math.max(tokenScore, 0.55 * tokenScore + 0.45 * charScore);
  }

  private findFuzzyMatches(
    requested: string,
    available: string[],
  ): { matches: string[]; suggestion?: string } {
    if (!available.length) return { matches: [], suggestion: undefined };

    const scored = available
      .map((name) => ({ name, score: this.scoreFunctionSimilarity(requested, name) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const threshold = 0.25;
    const epsilon = 0.05;
    const matches = scored
      .filter((x) => x.score >= threshold && best && (best.score - x.score) <= epsilon)
      .map((x) => x.name);

    return {
      matches,
      suggestion: best?.name,
    };
  }
}
