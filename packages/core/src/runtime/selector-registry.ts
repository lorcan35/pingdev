import { EventEmitter } from 'node:events';
import type { SelectorDef } from '../types.js';

export class SelectorRegistry extends EventEmitter {
  private selectors: Record<string, SelectorDef>;
  private version: number = 0;
  private lastUpdated: string;

  constructor(initial: Record<string, SelectorDef>) {
    super();
    // Deep clone to avoid mutating the input
    this.selectors = {};
    for (const [key, def] of Object.entries(initial)) {
      this.selectors[key] = { name: def.name, tiers: [...def.tiers] };
    }
    this.lastUpdated = new Date().toISOString();
  }

  /** Update a selector's tiers in-memory and increment the version. */
  hotPatch(name: string, newTiers: string[]): void {
    const existing = this.selectors[name];
    if (existing) {
      existing.tiers = [...newTiers];
    } else {
      this.selectors[name] = { name, tiers: [...newTiers] };
    }
    this.version++;
    this.lastUpdated = new Date().toISOString();
    this.emit('patched', { name, newTiers, version: this.version });
  }

  /** Get a single selector by name. */
  getSelector(name: string): SelectorDef | undefined {
    return this.selectors[name];
  }

  /** Get all selectors. */
  getAllSelectors(): Record<string, SelectorDef> {
    return this.selectors;
  }

  /** Get the current version number. */
  getVersion(): number {
    return this.version;
  }

  /** Serialize to JSON-safe object. */
  toJSON(): { selectors: Record<string, SelectorDef>; version: number; lastUpdated: string } {
    return {
      selectors: this.selectors,
      version: this.version,
      lastUpdated: this.lastUpdated,
    };
  }
}
