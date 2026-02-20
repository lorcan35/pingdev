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

export interface PingAppFunctionDef {
  app: string;
  domain: string;
  functions: Array<{
    name: string;
    description: string;
    params: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  }>;
}

export class FunctionRegistry {
  private apps = new Map<string, RegisteredApp>();
  private extBridge: ExtensionBridge;
  private pingAppDefs: PingAppFunctionDef[] = [];

  constructor(extBridge: ExtensionBridge) {
    this.extBridge = extBridge;
  }

  /** Register PingApp function definitions (from app-routes). */
  registerPingApps(defs: PingAppFunctionDef[]): void {
    this.pingAppDefs = defs;
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
    return result;
  }

  /** List functions for a specific app/tab. */
  listForApp(appName: string): FunctionDef[] | null {
    this.refresh();
    const app = this.apps.get(appName);
    return app ? app.functions : null;
  }

  /** Describe a specific function. */
  describe(qualifiedName: string): FunctionDef | null {
    this.refresh();
    for (const app of this.apps.values()) {
      const fn = app.functions.find((f) => f.name === qualifiedName);
      if (fn) return fn;
    }
    return null;
  }

  /** Get the tab/device ID for an app name. */
  getTabId(appName: string): string | null {
    this.refresh();
    const app = this.apps.get(appName);
    return app ? app.tabId : null;
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
    if (!app) {
      throw new Error(`App "${appName}" not found. Available: ${[...this.apps.keys()].join(', ')}`);
    }

    const fn = app.functions.find((f) => f.name === qualifiedName);
    if (!fn) {
      throw new Error(
        `Function "${qualifiedName}" not found. Available: ${app.functions.map((f) => f.name).join(', ')}`,
      );
    }

    // Validate required params
    for (const param of fn.params) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter "${param.name}" for ${qualifiedName}`);
      }
    }

    return this.extBridge.callDevice({
      deviceId: app.tabId,
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
}
