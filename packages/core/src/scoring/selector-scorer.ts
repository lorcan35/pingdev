/** Score individual selectors and SelectorDefs by tier and fragility. */

import type { SelectorDef } from '../types.js';
import type { SelectorScore, SelectorTier } from './types.js';

/** Auto-generated ID prefixes that break across deploys. */
const DYNAMIC_ID_PREFIXES = ['radix-', 'react-', '__next', 'rc-', ':r'];

/** Check if an ID looks auto-generated. */
function isDynamicId(selector: string): boolean {
  const idMatch = selector.match(/#([^\s\[\]>+~,]+)/);
  if (!idMatch) return false;
  const id = idMatch[1];
  return DYNAMIC_ID_PREFIXES.some(p => id.startsWith(p)) || /^[a-f0-9-]{8,}$/.test(id);
}

/** Count nesting depth (combinators: >, space, +, ~). */
function nestingDepth(selector: string): number {
  // Count significant combinators (ignore those inside attribute selectors)
  const stripped = selector.replace(/\[[^\]]*\]/g, '');
  const parts = stripped.split(/\s*[>\s+~]\s*/).filter(Boolean);
  return parts.length - 1;
}

/** Count CSS classes in a selector. */
function classCount(selector: string): number {
  const stripped = selector.replace(/\[[^\]]*\]/g, '');
  const matches = stripped.match(/\./g);
  return matches ? matches.length : 0;
}

/** Score a single selector string and classify its tier. */
export function scoreSelectorTier(selector: string): SelectorScore {
  const s = selector.trim();

  // ── ARIA selectors ──
  if (/\[role=/.test(s) || /\[aria-label=/.test(s) || /\[aria-/.test(s) || s.startsWith('role:')) {
    let confidence = 0.95;
    if (/\[aria-label=/.test(s)) confidence = 0.95;
    if (/\[role=/.test(s)) confidence = 0.9;
    // Bonus for combined aria selectors
    if (/\[aria-label=/.test(s) && /\[role=/.test(s)) confidence = 1.0;

    return {
      name: s,
      tier: 'aria',
      confidence: applyPenalties(s, confidence),
      reason: 'ARIA selector — stable across UI changes',
    };
  }

  // ── data-testid ──
  if (/\[data-testid=/.test(s)) {
    let confidence = 0.9;
    // Simple data-testid is best
    if (/^\[data-testid=/.test(s)) confidence = 0.95;

    return {
      name: s,
      tier: 'data-testid',
      confidence: applyPenalties(s, confidence),
      reason: 'data-testid — explicitly stable test hook',
    };
  }

  // ── XPath ──
  if (s.startsWith('//') || s.startsWith('xpath=')) {
    let confidence = 0.4;
    if (/text\(\)/.test(s)) confidence = 0.5;
    if (/\[contains\(/.test(s) && /text\(\)/.test(s)) confidence = 0.45;
    if (/\[\d+\]/.test(s)) confidence = 0.3; // positional xpath
    // Complex deep xpaths
    const slashCount = (s.match(/\//g) || []).length;
    if (slashCount > 6) confidence -= 0.1;

    // Check for dynamic IDs in XPath
    if (DYNAMIC_ID_PREFIXES.some(p => s.includes(p))) {
      confidence -= 0.3;
      return {
        name: s,
        tier: 'xpath',
        confidence: clamp(confidence),
        reason: 'XPath with auto-generated ID — extremely fragile',
      };
    }

    return {
      name: s,
      tier: 'xpath',
      confidence: clamp(confidence),
      reason: slashCount > 6
        ? 'Deeply nested XPath — fragile'
        : 'XPath selector — moderately fragile',
    };
  }

  // ── Positional selectors ──
  if (/:nth-child/.test(s) || /:nth-of-type/.test(s)) {
    const confidence = 0.2;
    return {
      name: s,
      tier: 'positional',
      confidence: applyPenalties(s, confidence),
      reason: 'Positional selector — breaks when DOM order changes',
    };
  }

  // ── ID-based selectors ──
  if (s.startsWith('#') || /\[id=/.test(s)) {
    if (isDynamicId(s)) {
      return {
        name: s,
        tier: 'semantic-id',
        confidence: clamp(0.75 - 0.3), // penalty for dynamic
        reason: 'Auto-generated ID — will break on next deploy',
      };
    }

    // Name/type attributes in combination
    let confidence = 0.8;
    // Simple #id is better
    if (/^#[a-z][a-z0-9-]+$/i.test(s)) confidence = 0.85;

    return {
      name: s,
      tier: 'semantic-id',
      confidence: applyPenalties(s, confidence),
      reason: 'Semantic ID — stable if hand-authored',
    };
  }

  // ── Name/type attribute selectors ──
  if (/\[name=/.test(s) || /\[type=/.test(s)) {
    let confidence = 0.75;
    if (/\[name=/.test(s) && /\[type=/.test(s)) confidence = 0.8;

    return {
      name: s,
      tier: 'semantic-id',
      confidence: applyPenalties(s, confidence),
      reason: 'Name/type attribute — moderately stable',
    };
  }

  // ── CSS class selectors ──
  if (s.startsWith('.') || /\.\w/.test(s)) {
    const classes = classCount(s);
    let confidence = 0.55;
    if (classes === 1) confidence = 0.6;
    if (classes === 2) confidence = 0.5;
    if (classes >= 3) confidence = 0.45;
    if (classes >= 4) confidence -= 0.15;

    const depth = nestingDepth(s);
    if (depth > 3) confidence -= 0.2;

    return {
      name: s,
      tier: 'css-class',
      confidence: applyPenalties(s, clamp(confidence)),
      reason: classes > 3
        ? 'Long CSS class chain — fragile'
        : 'CSS class selector — moderate stability',
    };
  }

  // ── Fallback: tag or unknown ──
  return {
    name: s,
    tier: 'css-class',
    confidence: 0.4,
    reason: 'Generic selector — low stability',
  };
}

/** Apply universal penalties for fragile patterns. */
function applyPenalties(selector: string, confidence: number): number {
  let c = confidence;

  // Dynamic/auto-generated ID penalty
  if (isDynamicId(selector)) c -= 0.3;

  // Deep nesting penalty
  if (nestingDepth(selector) > 3) c -= 0.2;

  // Long class chain penalty
  if (classCount(selector) > 3) c -= 0.15;

  return clamp(c);
}

/** Clamp confidence to [0, 1]. */
function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Score all tiers of a SelectorDef, returning scores sorted by confidence (highest first). */
export function scoreSelectorDef(selectorDef: SelectorDef): SelectorScore[] {
  const scores = selectorDef.tiers.map(tier => {
    const score = scoreSelectorTier(tier);
    return { ...score, name: selectorDef.name };
  });

  return scores.sort((a, b) => b.confidence - a.confidence);
}
