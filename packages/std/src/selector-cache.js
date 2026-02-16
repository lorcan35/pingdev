// @pingdev/std — Selector repair cache
// Persists successful selector repairs to disk for fast retries.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultPath() {
  return join(homedir(), '.pingos', 'selector-cache.json');
}

function urlToPattern(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function urlMatches(pattern, url) {
  if (!pattern) return true;
  if (pattern === '*') return true;
  try {
    const u = new URL(url);
    if (pattern === u.origin) return true;
    return url.startsWith(pattern);
  } catch {
    return url.startsWith(pattern);
  }
}

export class SelectorCache {
  constructor(opts = {}) {
    this.filePath = opts.path ?? defaultPath();
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.flushDebounceMs = opts.flushDebounceMs ?? 250;
    this.loaded = false;
    this.cache = {};
    this.flushTimer = null;
    this.dirty = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.cache = parsed;
    } catch {
      this.cache = {};
    }
    this.pruneExpired();
  }

  getAll() {
    this.pruneExpired();
    return { ...this.cache };
  }

  lookup(selector, url) {
    this.pruneExpired();
    const entry = this.cache[selector];
    if (!entry) return null;
    if (url && !urlMatches(entry.url, url)) return null;

    entry.hitCount = (entry.hitCount ?? 0) + 1;
    this.markDirty();
    return entry.repairedSelector;
  }

  store(original, repaired, url, confidence) {
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

  pruneExpired() {
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

  markDirty() {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushToDisk();
    }, this.flushDebounceMs);
  }

  async flushToDisk() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }
}
