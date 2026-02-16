// @pingdev/std — Selector repair cache
// Persists successful selector repairs to disk for fast retries.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// Cache file: ~/.pingos/selector-cache.json
export interface SelectorCacheEntry {
  repairedSelector: string;
  url: string; // URL pattern (stored as origin by default)
  confidence: number;
  timestamp: number;
  hitCount: number;
}

export interface SelectorCacheFile {
  [originalSelector: string]: SelectorCacheEntry;
}

export interface SelectorCacheOptions {
  path?: string;
  /** Entry TTL in ms (default: 7 days). */
  ttlMs?: number;
  /** Debounce for disk flush (default: 250ms). */
  flushDebounceMs?: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultPath(): string {
  return join(homedir(), '.pingos', 'selector-cache.json');
}

function urlToPattern(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function urlMatches(pattern: string, url: string): boolean {
  if (!pattern) return true;
  if (pattern === '*') return true;
  try {
    const u = new URL(url);
    // Exact-origin match is the default behavior.
    if (pattern === u.origin) return true;
    // Also allow prefix match for explicit patterns.
    return url.startsWith(pattern);
  } catch {
    return url.startsWith(pattern);
  }
}

export class SelectorCache {
  private filePath: string;
  private ttlMs: number;
  private flushDebounceMs: number;
  private loaded = false;
  private cache: SelectorCacheFile = {};
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(opts: SelectorCacheOptions = {}) {
    this.filePath = opts.path ?? defaultPath();
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.flushDebounceMs = opts.flushDebounceMs ?? 250;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SelectorCacheFile;
      if (parsed && typeof parsed === 'object') this.cache = parsed;
    } catch {
      // missing / invalid cache file → treat as empty
      this.cache = {};
    }
    this.pruneExpired();
  }

  /** For debugging. Returns the in-memory cache. */
  getAll(): SelectorCacheFile {
    this.pruneExpired();
    return { ...this.cache };
  }

  lookup(selector: string, url: string): string | null {
    this.pruneExpired();
    const entry = this.cache[selector];
    if (!entry) return null;
    if (url && !urlMatches(entry.url, url)) return null;

    entry.hitCount = (entry.hitCount ?? 0) + 1;
    this.markDirty();
    return entry.repairedSelector;
  }

  store(original: string, repaired: string, url: string, confidence: number): void {
    const o = (original ?? '').trim();
    const r = (repaired ?? '').trim();
    if (!o || !r) return;

    this.cache[o] = {
      repairedSelector: r,
      url: urlToPattern(url),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      timestamp: Date.now(),
      hitCount: this.cache[o]?.hitCount ?? 0,
    };

    this.markDirty();
  }

  // ---- internals ----

  private pruneExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(this.cache)) {
      if (!v || typeof v !== 'object') {
        delete this.cache[k];
        changed = true;
        continue;
      }
      const ts = typeof v.timestamp === 'number' ? v.timestamp : 0;
      if (now - ts > this.ttlMs) {
        delete this.cache[k];
        changed = true;
      }
    }
    if (changed) this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushToDisk();
    }, this.flushDebounceMs);
  }

  private async flushToDisk(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch {
      // ignore cache write failures
    }
  }
}
