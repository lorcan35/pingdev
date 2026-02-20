// Structured data extraction: JSON-LD, OpenGraph, Microdata, Twitter Cards, Meta Tags
// Runs entirely in the content script — no DOM walking needed for structured data.

export interface StructuredField {
  value: string | string[] | Record<string, unknown>;
  source: 'json-ld' | 'opengraph' | 'microdata' | 'twitter-card' | 'meta-tag';
}

export interface StructuredDataResult {
  data: Record<string, unknown>;
  sources: Record<string, string>;
  confidence: number;
  fieldCount: number;
}

/** Extract all JSON-LD scripts from the page. */
export function extractJsonLd(): Record<string, unknown>[] {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const results: Record<string, unknown>[] = [];
  for (const script of Array.from(scripts)) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else if (typeof parsed === 'object' && parsed !== null) {
        results.push(parsed);
      }
    } catch { /* invalid JSON-LD */ }
  }
  return results;
}

/** Extract OpenGraph meta tags (og:*). */
export function extractOpenGraph(): Record<string, string> {
  const result: Record<string, string> = {};
  const metas = document.querySelectorAll('meta[property^="og:"]');
  for (const meta of Array.from(metas)) {
    const prop = meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (prop && content) {
      // Strip "og:" prefix for cleaner keys
      const key = prop.replace(/^og:/, '');
      result[key] = content;
    }
  }
  return result;
}

/** Extract Microdata (itemscope/itemprop). */
export function extractMicrodata(): Record<string, unknown>[] {
  const scopes = document.querySelectorAll('[itemscope][itemtype]');
  const results: Record<string, unknown>[] = [];

  for (const scope of Array.from(scopes)) {
    const item: Record<string, unknown> = {
      '@type': scope.getAttribute('itemtype') || '',
    };

    const props = scope.querySelectorAll('[itemprop]');
    for (const prop of Array.from(props)) {
      // Skip nested itemscopes that belong to a deeper scope
      const closestScope = prop.closest('[itemscope]');
      if (closestScope !== scope) continue;

      const name = prop.getAttribute('itemprop') || '';
      if (!name) continue;

      // Extract value based on element type
      let value: string;
      if (prop.tagName === 'META') {
        value = prop.getAttribute('content') || '';
      } else if (prop.tagName === 'A' || prop.tagName === 'LINK') {
        value = prop.getAttribute('href') || '';
      } else if (prop.tagName === 'IMG') {
        value = prop.getAttribute('src') || '';
      } else if (prop.tagName === 'TIME') {
        value = prop.getAttribute('datetime') || prop.textContent?.trim() || '';
      } else if (prop.hasAttribute('content')) {
        value = prop.getAttribute('content') || '';
      } else {
        value = prop.textContent?.trim() || '';
      }

      item[name] = value;
    }

    if (Object.keys(item).length > 1) {
      results.push(item);
    }
  }

  return results;
}

/** Extract Twitter Card meta tags (twitter:*). */
export function extractTwitterCards(): Record<string, string> {
  const result: Record<string, string> = {};
  const metas = document.querySelectorAll('meta[name^="twitter:"]');
  for (const meta of Array.from(metas)) {
    const name = meta.getAttribute('name');
    const content = meta.getAttribute('content');
    if (name && content) {
      const key = name.replace(/^twitter:/, '');
      result[key] = content;
    }
  }
  return result;
}

/** Extract common meta tags: title, description, canonical, author, date. */
export function extractMetaTags(): Record<string, string> {
  const result: Record<string, string> = {};

  // <title>
  const title = document.querySelector('title');
  if (title?.textContent) result.title = title.textContent.trim();

  // <meta name="description">
  const desc = document.querySelector('meta[name="description"]');
  if (desc) result.description = desc.getAttribute('content') || '';

  // <link rel="canonical">
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) result.canonical = canonical.getAttribute('href') || '';

  // <meta name="author">
  const author = document.querySelector('meta[name="author"]');
  if (author) result.author = author.getAttribute('content') || '';

  // date meta tags
  const dateSelectors = [
    'meta[name="date"]',
    'meta[name="article:published_time"]',
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[name="DC.date"]',
  ];
  for (const sel of dateSelectors) {
    const dateMeta = document.querySelector(sel);
    if (dateMeta) {
      result.date = dateMeta.getAttribute('content') || '';
      break;
    }
  }

  // <meta name="keywords">
  const keywords = document.querySelector('meta[name="keywords"]');
  if (keywords) result.keywords = keywords.getAttribute('content') || '';

  // <meta name="robots">
  const robots = document.querySelector('meta[name="robots"]');
  if (robots) result.robots = robots.getAttribute('content') || '';

  return result;
}

/**
 * Flatten JSON-LD data into a simple key-value map.
 * Handles @graph arrays and nested objects.
 */
function flattenJsonLd(items: Record<string, unknown>[]): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  for (const item of items) {
    // Handle @graph arrays
    if (Array.isArray(item['@graph'])) {
      const graphItems = item['@graph'] as Record<string, unknown>[];
      Object.assign(flat, flattenJsonLd(graphItems));
      continue;
    }

    for (const [key, value] of Object.entries(item)) {
      if (key.startsWith('@')) {
        if (key === '@type') flat._type = value;
        continue;
      }
      // Skip complex nested objects, keep primitives and strings
      if (value === null || value === undefined) continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        // For nested objects like "author": { "name": "John" }, flatten as author_name
        const nested = value as Record<string, unknown>;
        for (const [nk, nv] of Object.entries(nested)) {
          if (nk.startsWith('@')) continue;
          if (typeof nv === 'string' || typeof nv === 'number' || typeof nv === 'boolean') {
            flat[`${key}_${nk}`] = nv;
          }
        }
      } else {
        flat[key] = value;
      }
    }
  }

  return flat;
}

/**
 * Merge all structured data sources into a unified result.
 * Priority: JSON-LD > Microdata > OpenGraph > Twitter > Meta tags
 */
export function extractStructuredData(): StructuredDataResult {
  const data: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  let fieldCount = 0;

  // 1. Meta tags (lowest priority — set first, overridden by higher sources)
  const metaTags = extractMetaTags();
  for (const [key, value] of Object.entries(metaTags)) {
    if (value) {
      data[key] = value;
      sources[key] = 'meta-tag';
      fieldCount++;
    }
  }

  // 2. Twitter Cards
  const twitter = extractTwitterCards();
  for (const [key, value] of Object.entries(twitter)) {
    if (value) {
      data[key] = value;
      sources[key] = 'twitter-card';
      fieldCount++;
    }
  }

  // 3. OpenGraph (overrides twitter/meta for same fields)
  const og = extractOpenGraph();
  for (const [key, value] of Object.entries(og)) {
    if (value) {
      data[key] = value;
      sources[key] = 'opengraph';
      fieldCount++;
    }
  }

  // 4. Microdata
  const microdata = extractMicrodata();
  if (microdata.length > 0) {
    // If there's a single main item, merge its fields
    if (microdata.length === 1) {
      for (const [key, value] of Object.entries(microdata[0])) {
        if (key.startsWith('@')) {
          if (key === '@type') { data._type = value; sources._type = 'microdata'; }
          continue;
        }
        if (value) {
          data[key] = value;
          sources[key] = 'microdata';
          fieldCount++;
        }
      }
    } else {
      // Multiple items — store as array under _items
      data._items = microdata;
      sources._items = 'microdata';
      fieldCount++;
    }
  }

  // 5. JSON-LD (highest priority)
  const jsonLd = extractJsonLd();
  if (jsonLd.length > 0) {
    const flat = flattenJsonLd(jsonLd);
    for (const [key, value] of Object.entries(flat)) {
      if (value !== null && value !== undefined && value !== '') {
        data[key] = value;
        sources[key] = 'json-ld';
        fieldCount++;
      }
    }
    // Store raw JSON-LD for advanced consumers
    data._jsonLd = jsonLd;
    sources._jsonLd = 'json-ld';
  }

  // Calculate confidence: more structured data = higher confidence
  const confidence = Math.min(1.0, fieldCount / 10);

  return { data, sources, confidence, fieldCount };
}
