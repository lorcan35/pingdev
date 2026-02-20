/**
 * Zero-Shot Site Adaptation — Heuristic page-type detection and schema generation.
 *
 * Runs entirely in the gateway by analyzing DOM data returned from the extension's
 * content script. No LLM calls needed — pure heuristic pattern matching in <100ms.
 *
 * The content script sends back a lightweight DOM snapshot (via the "discover" op)
 * containing: visible text, tag structure, meta tags, JSON-LD, and interactive elements.
 * This module classifies the page type and generates extraction schemas.
 */

import type { PageType, DiscoverResult, DiscoveredSchema, SchemaField } from './types.js';

// ---------------------------------------------------------------------------
// Heuristic classifiers
// ---------------------------------------------------------------------------

interface DomSnapshot {
  url?: string;
  title?: string;
  meta?: Record<string, string>;        // og:title, description, etc.
  jsonLd?: Record<string, unknown>[];    // schema.org JSON-LD blocks
  elements?: DomElement[];               // sampled interactive + structural elements
  tables?: TableInfo[];                  // detected <table> structures
  forms?: FormInfo[];                    // detected <form> structures
  repeatedGroups?: RepeatedGroup[];      // groups of similar sibling elements
}

interface DomElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  ariaLabel?: string;
  attributes?: Record<string, string>;
  selector?: string;
}

interface TableInfo {
  selector: string;
  headers: string[];
  rowCount: number;
}

interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  inputs: Array<{ name: string; type: string; selector: string; label?: string }>;
}

interface RepeatedGroup {
  containerSelector: string;
  itemSelector: string;
  count: number;
  sampleFields?: Record<string, string>;  // field name -> selector relative to item
}

interface ClassifierScore {
  pageType: PageType;
  confidence: number;
  schemas: DiscoveredSchema[];
}

// Price patterns across currencies
const PRICE_RE = /(?:\$|€|£|¥|₹|USD|EUR|GBP)\s*[\d,.]+|[\d,.]+\s*(?:\$|€|£|¥|₹|USD|EUR|GBP)/i;

function classifyProduct(snapshot: DomSnapshot): ClassifierScore | null {
  let score = 0;
  const fields: Record<string, SchemaField> = {};

  // Check JSON-LD for Product schema
  const productLd = snapshot.jsonLd?.find(
    (ld) => (ld['@type'] as string)?.toLowerCase() === 'product',
  );
  if (productLd) {
    score += 0.4;
  }

  // Check for price patterns in text
  const priceElements = (snapshot.elements ?? []).filter(
    (el) => PRICE_RE.test(el.text ?? ''),
  );
  if (priceElements.length > 0) {
    score += 0.25;
    const best = priceElements.find((e) => e.selector) ?? priceElements[0];
    if (best.selector) fields.price = { selector: best.selector };
  }

  // Check for product-related meta tags
  const ogType = snapshot.meta?.['og:type'];
  if (ogType === 'product' || ogType === 'product.item') {
    score += 0.15;
  }

  // Check for itemprop="name" or large heading
  const nameEl = (snapshot.elements ?? []).find(
    (el) =>
      el.attributes?.['itemprop'] === 'name' ||
      (el.tag === 'h1' && (el.text?.length ?? 0) > 3),
  );
  if (nameEl?.selector) {
    score += 0.1;
    fields.title = { selector: nameEl.selector };
  }

  // Check for ratings / reviews
  const ratingEl = (snapshot.elements ?? []).find(
    (el) =>
      el.ariaLabel?.toLowerCase().includes('rating') ||
      el.ariaLabel?.toLowerCase().includes('star') ||
      el.classes?.some((c) => c.includes('rating') || c.includes('star')),
  );
  if (ratingEl?.selector) {
    score += 0.05;
    fields.rating = { selector: ratingEl.selector };
  }

  // Product image
  const imgEl = (snapshot.elements ?? []).find(
    (el) =>
      el.tag === 'img' &&
      (el.id?.includes('product') ||
        el.id?.includes('main') ||
        el.classes?.some((c) => c.includes('product') || c.includes('main'))),
  );
  if (imgEl?.selector) {
    score += 0.05;
    fields.image = { selector: imgEl.selector, attribute: 'src' };
  }

  if (score < 0.2) return null;

  // Ensure we have at least a title
  if (!fields.title) {
    const h1 = (snapshot.elements ?? []).find((el) => el.tag === 'h1' && el.selector);
    if (h1?.selector) fields.title = { selector: h1.selector };
  }

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'product', fields }]
    : [];

  return { pageType: 'product', confidence: Math.min(score, 0.99), schemas };
}

function classifySearch(snapshot: DomSnapshot): ClassifierScore | null {
  let score = 0;
  const fields: Record<string, SchemaField> = {};

  // Repeated groups suggest a listing/search page
  if (snapshot.repeatedGroups && snapshot.repeatedGroups.length > 0) {
    const largest = snapshot.repeatedGroups.reduce((a, b) =>
      a.count > b.count ? a : b,
    );
    if (largest.count >= 3) {
      score += 0.35;
      fields.items = { selector: largest.itemSelector, multiple: true };
      if (largest.sampleFields) {
        for (const [name, sel] of Object.entries(largest.sampleFields)) {
          fields[`item_${name}`] = { selector: `${largest.itemSelector} ${sel}` };
        }
      }
    }
  }

  // URL patterns (q=, search=, query=)
  const url = snapshot.url ?? '';
  if (/[?&](q|search|query|keyword)=/i.test(url)) {
    score += 0.2;
  }

  // Search input present
  const searchInput = (snapshot.elements ?? []).find(
    (el) =>
      el.tag === 'input' &&
      (el.attributes?.['type'] === 'search' ||
        el.attributes?.['name']?.includes('search') ||
        el.attributes?.['name']?.includes('query') ||
        el.ariaLabel?.toLowerCase().includes('search')),
  );
  if (searchInput?.selector) {
    score += 0.15;
    fields.searchInput = { selector: searchInput.selector };
  }

  // Pagination
  const pagination = (snapshot.elements ?? []).find(
    (el) =>
      el.ariaLabel?.toLowerCase().includes('pagination') ||
      el.classes?.some((c) => c.includes('pagination') || c.includes('pager')),
  );
  if (pagination) {
    score += 0.1;
  }

  if (score < 0.2) return null;

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'search_results', fields }]
    : [];

  return { pageType: 'search', confidence: Math.min(score, 0.99), schemas };
}

function classifyArticle(snapshot: DomSnapshot): ClassifierScore | null {
  let score = 0;
  const fields: Record<string, SchemaField> = {};

  // JSON-LD Article type
  const articleLd = snapshot.jsonLd?.find(
    (ld) =>
      typeof ld['@type'] === 'string' &&
      /article|newsarticle|blogposting|report/i.test(ld['@type']),
  );
  if (articleLd) {
    score += 0.35;
  }

  // og:type = article
  if (snapshot.meta?.['og:type'] === 'article') {
    score += 0.2;
  }

  // <article> tag present
  const articleTag = (snapshot.elements ?? []).find((el) => el.tag === 'article');
  if (articleTag?.selector) {
    score += 0.15;
    fields.body = { selector: articleTag.selector };
  }

  // Byline / author
  const authorEl = (snapshot.elements ?? []).find(
    (el) =>
      el.attributes?.['itemprop'] === 'author' ||
      el.classes?.some((c) => c.includes('author') || c.includes('byline')),
  );
  if (authorEl?.selector) {
    score += 0.1;
    fields.author = { selector: authorEl.selector };
  }

  // Published date
  const dateEl = (snapshot.elements ?? []).find(
    (el) =>
      el.tag === 'time' ||
      el.attributes?.['itemprop'] === 'datePublished' ||
      el.classes?.some((c) => c.includes('date') || c.includes('published')),
  );
  if (dateEl?.selector) {
    score += 0.05;
    fields.date = { selector: dateEl.selector };
  }

  // Title (h1)
  const h1 = (snapshot.elements ?? []).find(
    (el) => el.tag === 'h1' && (el.text?.length ?? 0) > 10,
  );
  if (h1?.selector) {
    score += 0.05;
    fields.title = { selector: h1.selector };
  }

  if (score < 0.2) return null;

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'article', fields }]
    : [];

  return { pageType: 'article', confidence: Math.min(score, 0.99), schemas };
}

function classifyFeed(snapshot: DomSnapshot): ClassifierScore | null {
  let score = 0;
  const fields: Record<string, SchemaField> = {};

  // Multiple repeated groups with engagement-like content
  if (snapshot.repeatedGroups && snapshot.repeatedGroups.length > 0) {
    const largest = snapshot.repeatedGroups.reduce((a, b) =>
      a.count > b.count ? a : b,
    );
    if (largest.count >= 5) {
      score += 0.3;
      fields.posts = { selector: largest.itemSelector, multiple: true };
    }
  }

  // Social-specific URL patterns
  const url = (snapshot.url ?? '').toLowerCase();
  if (/\/(feed|timeline|home|stream|discover)/.test(url)) {
    score += 0.15;
  }

  // og:type = website on social-like domains
  const ogSiteName = snapshot.meta?.['og:site_name']?.toLowerCase() ?? '';
  if (/reddit|twitter|facebook|mastodon|hacker.?news/i.test(ogSiteName)) {
    score += 0.2;
  }

  // Infinite scroll or "load more" button
  const loadMore = (snapshot.elements ?? []).find(
    (el) =>
      (el.text ?? '').toLowerCase().includes('load more') ||
      (el.text ?? '').toLowerCase().includes('show more'),
  );
  if (loadMore) {
    score += 0.1;
  }

  if (score < 0.2) return null;

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'feed', fields }]
    : [];

  return { pageType: 'feed', confidence: Math.min(score, 0.99), schemas };
}

function classifyTable(snapshot: DomSnapshot): ClassifierScore | null {
  if (!snapshot.tables || snapshot.tables.length === 0) return null;

  const largest = snapshot.tables.reduce((a, b) =>
    a.rowCount > b.rowCount ? a : b,
  );

  if (largest.rowCount < 2) return null;

  let score = 0.3;
  if (largest.headers.length > 0) score += 0.2;
  if (largest.rowCount >= 10) score += 0.15;
  if (largest.rowCount >= 50) score += 0.1;

  const fields: Record<string, SchemaField> = {
    table: { selector: largest.selector },
  };
  for (const header of largest.headers) {
    const safeName = header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (safeName) {
      fields[safeName] = { selector: `${largest.selector} td`, multiple: true };
    }
  }

  const schemas: DiscoveredSchema[] = [{ name: 'table_data', fields }];
  return { pageType: 'table', confidence: Math.min(score, 0.99), schemas };
}

function classifyForm(snapshot: DomSnapshot): ClassifierScore | null {
  if (!snapshot.forms || snapshot.forms.length === 0) return null;

  const form = snapshot.forms.reduce((a, b) =>
    a.inputs.length > b.inputs.length ? a : b,
  );

  if (form.inputs.length < 1) return null;

  let score = 0.3;
  if (form.inputs.length >= 3) score += 0.2;
  if (form.inputs.length >= 6) score += 0.15;

  const fields: Record<string, SchemaField> = {};
  for (const input of form.inputs) {
    const name = input.label || input.name || input.type;
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (safeName && input.selector) {
      fields[safeName] = { selector: input.selector };
    }
  }

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'form', fields }]
    : [];

  return { pageType: 'form', confidence: Math.min(score, 0.99), schemas };
}

function classifyChat(snapshot: DomSnapshot): ClassifierScore | null {
  let score = 0;
  const fields: Record<string, SchemaField> = {};

  // Look for chat-like patterns: textarea + send button + message list
  const textarea = (snapshot.elements ?? []).find(
    (el) =>
      el.tag === 'textarea' ||
      (el.tag === 'div' && el.attributes?.['contenteditable'] === 'true'),
  );
  if (textarea?.selector) {
    score += 0.25;
    fields.input = { selector: textarea.selector };
  }

  // Send button
  const sendBtn = (snapshot.elements ?? []).find(
    (el) =>
      el.tag === 'button' &&
      ((el.text ?? '').toLowerCase().includes('send') ||
        (el.ariaLabel ?? '').toLowerCase().includes('send')),
  );
  if (sendBtn?.selector) {
    score += 0.15;
    fields.sendButton = { selector: sendBtn.selector };
  }

  // Message-like repeated content
  if (snapshot.repeatedGroups) {
    const msgGroup = snapshot.repeatedGroups.find(
      (g) => g.count >= 2 && g.itemSelector.includes('message'),
    );
    if (msgGroup) {
      score += 0.2;
      fields.messages = { selector: msgGroup.itemSelector, multiple: true };
    }
  }

  // URL hint
  const url = (snapshot.url ?? '').toLowerCase();
  if (/chat|gemini|claude|chatgpt|copilot|assistant/.test(url)) {
    score += 0.15;
  }

  if (score < 0.2) return null;

  const schemas: DiscoveredSchema[] = Object.keys(fields).length > 0
    ? [{ name: 'chat', fields }]
    : [];

  return { pageType: 'chat', confidence: Math.min(score, 0.99), schemas };
}

// ---------------------------------------------------------------------------
// Main discovery function
// ---------------------------------------------------------------------------

const classifiers = [
  classifyProduct,
  classifySearch,
  classifyArticle,
  classifyFeed,
  classifyTable,
  classifyForm,
  classifyChat,
];

/**
 * Analyze a DOM snapshot and return the best page type + extraction schemas.
 * Runs all classifiers and picks the highest-confidence match.
 */
export function discoverPage(snapshot: DomSnapshot): DiscoverResult {
  let best: ClassifierScore = { pageType: 'unknown', confidence: 0, schemas: [] };

  for (const classify of classifiers) {
    const result = classify(snapshot);
    if (result && result.confidence > best.confidence) {
      best = result;
    }
  }

  // Extract metadata from OG / meta tags
  const metadata: Record<string, string> = {};
  if (snapshot.meta) {
    for (const [key, val] of Object.entries(snapshot.meta)) {
      if (val && typeof val === 'string') metadata[key] = val;
    }
  }

  return {
    pageType: best.pageType,
    confidence: Math.round(best.confidence * 100) / 100,
    title: snapshot.title ?? snapshot.meta?.['og:title'],
    url: snapshot.url,
    schemas: best.schemas,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
