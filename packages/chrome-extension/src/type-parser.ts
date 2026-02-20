// Type-aware parsing for extracted values
// Auto-detects or explicitly parses: currency, date, rating, number, percentage,
// phone, email, url, boolean, list

export type ParsedType =
  | 'currency'
  | 'date'
  | 'rating'
  | 'number'
  | 'percentage'
  | 'phone'
  | 'email'
  | 'url'
  | 'boolean'
  | 'list'
  | 'string';

export interface ParsedValue {
  type: ParsedType;
  value: unknown;
  raw: string;
  confidence: number;
}

interface TypeParser {
  type: ParsedType;
  test: (raw: string) => boolean;
  parse: (raw: string) => { value: unknown; confidence: number };
}

// Currency symbols → ISO codes
const CURRENCY_MAP: Record<string, string> = {
  '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
  '₩': 'KRW', '₽': 'RUB', 'R$': 'BRL', 'A$': 'AUD', 'C$': 'CAD',
  'CHF': 'CHF', 'kr': 'SEK', 'zł': 'PLN', '₺': 'TRY',
};

const CURRENCY_PATTERN = /^[\s]*([A-Z]{3}|[$€£¥₹₩₽₺]|R\$|A\$|C\$|CHF|kr|zł)\s*([\d,]+\.?\d*)\s*$|^[\s]*([\d,]+\.?\d*)\s*([A-Z]{3}|[$€£¥₹₩₽₺]|R\$|A\$|C\$|CHF|kr|zł)\s*$/;

const parsers: TypeParser[] = [
  // Currency: $29.99, €15.00, 29.99 USD, or multi-line "$50\n$25\n$30"
  {
    type: 'currency',
    test: (raw) => {
      const trimmed = raw.trim();
      // Test each line for multi-value strings
      const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);
      return lines.some(l => CURRENCY_PATTERN.test(l));
    },
    parse: (raw) => {
      const trimmed = raw.trim();
      const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);
      // If multiple lines, parse each separately
      if (lines.length > 1) {
        const parsed = lines.map(line => {
          const match = line.match(CURRENCY_PATTERN);
          if (!match) return null;
          const symbol = (match[1] || match[4] || '').trim();
          const numStr = (match[2] || match[3] || '').replace(/,/g, '');
          const amount = parseFloat(numStr);
          const currency = CURRENCY_MAP[symbol] || symbol;
          return { value: amount, currency, raw: line };
        }).filter(Boolean);
        if (parsed.length > 0) {
          return { value: parsed.length === 1 ? parsed[0] : parsed, confidence: 0.9 };
        }
      }
      // Single value
      const match = trimmed.match(CURRENCY_PATTERN);
      if (!match) return { value: raw, confidence: 0 };
      const symbol = (match[1] || match[4] || '').trim();
      const numStr = (match[2] || match[3] || '').replace(/,/g, '');
      const amount = parseFloat(numStr);
      const currency = CURRENCY_MAP[symbol] || symbol;
      return {
        value: { value: amount, currency, raw: trimmed },
        confidence: 0.95,
      };
    },
  },

  // Percentage: 45%, 45.5%, 0.45
  {
    type: 'percentage',
    test: (raw) => /^\s*-?[\d,]+\.?\d*\s*%\s*$/.test(raw),
    parse: (raw) => {
      const numStr = raw.replace(/[%,\s]/g, '');
      const pct = parseFloat(numStr);
      return {
        value: pct / 100,
        confidence: 0.95,
      };
    },
  },

  // Rating: 4.5/5, 4.5 out of 5, ★★★★☆, 4.5 stars
  {
    type: 'rating',
    test: (raw) => {
      const t = raw.trim();
      return /^\d+\.?\d*\s*(?:\/|out of)\s*\d+/.test(t) ||
        /^[★☆]+$/.test(t) ||
        /^\d+\.?\d*\s*stars?$/i.test(t);
    },
    parse: (raw) => {
      const trimmed = raw.trim();

      // Star characters
      if (/^[★☆]+$/.test(trimmed)) {
        const filled = (trimmed.match(/★/g) || []).length;
        const total = trimmed.length;
        return { value: { value: filled, max: total, raw: trimmed }, confidence: 0.9 };
      }

      // X/Y or X out of Y
      const match = trimmed.match(/^(\d+\.?\d*)\s*(?:\/|out of)\s*(\d+)/);
      if (match) {
        return {
          value: { value: parseFloat(match[1]), max: parseInt(match[2]), raw: trimmed },
          confidence: 0.95,
        };
      }

      // X stars
      const starMatch = trimmed.match(/^(\d+\.?\d*)\s*stars?$/i);
      if (starMatch) {
        return {
          value: { value: parseFloat(starMatch[1]), max: 5, raw: trimmed },
          confidence: 0.85,
        };
      }

      return { value: raw, confidence: 0 };
    },
  },

  // Date: various date formats
  {
    type: 'date',
    test: (raw) => {
      const t = raw.trim();
      // ISO date
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true;
      // Mon DD, YYYY
      if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}/i.test(t)) return true;
      // DD/MM/YYYY or MM/DD/YYYY
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(t)) return true;
      // Relative: "2 hours ago", "yesterday"
      if (/\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago/i.test(t)) return true;
      if (/^(?:today|yesterday|tomorrow)$/i.test(t)) return true;
      return false;
    },
    parse: (raw) => {
      const trimmed = raw.trim();
      // Handle relative dates: "5 minutes ago", "2 hours ago", "3 days ago"
      const relMatch = trimmed.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
      if (relMatch) {
        const amount = parseInt(relMatch[1], 10);
        const unit = relMatch[2].toLowerCase();
        const now = new Date();
        const msMap: Record<string, number> = {
          second: 1000, minute: 60_000, hour: 3_600_000,
          day: 86_400_000, week: 604_800_000,
          month: 2_592_000_000, year: 31_536_000_000,
        };
        const ms = msMap[unit] || 0;
        const computed = new Date(now.getTime() - amount * ms);
        return { value: { iso: computed.toISOString(), raw: trimmed }, confidence: 0.8 };
      }
      // Handle "today", "yesterday", "tomorrow"
      const todayMap: Record<string, number> = { today: 0, yesterday: -1, tomorrow: 1 };
      const lowerTrimmed = trimmed.toLowerCase();
      if (lowerTrimmed in todayMap) {
        const d = new Date();
        d.setDate(d.getDate() + todayMap[lowerTrimmed]);
        return { value: { iso: d.toISOString().split('T')[0], raw: trimmed }, confidence: 0.9 };
      }
      try {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          const iso = d.toISOString().split('T')[0];
          return { value: { iso, raw: trimmed }, confidence: 0.9 };
        }
      } catch { /* not parseable */ }
      return { value: { iso: null, raw: trimmed }, confidence: 0.5 };
    },
  },

  // Email
  {
    type: 'email',
    test: (raw) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim()),
    parse: (raw) => ({
      value: raw.trim().toLowerCase(),
      confidence: 0.95,
    }),
  },

  // Phone: +1 (555) 123-4567
  {
    type: 'phone',
    test: (raw) => {
      const t = raw.trim();
      return /^\+?\d[\d\s\-().]{7,}$/.test(t);
    },
    parse: (raw) => {
      const trimmed = raw.trim();
      const digits = trimmed.replace(/\D/g, '');
      let e164 = digits;
      if (!trimmed.startsWith('+') && digits.length === 10) {
        e164 = '1' + digits; // assume US
      }
      return {
        value: { e164: '+' + e164, raw: trimmed },
        confidence: 0.85,
      };
    },
  },

  // URL: relative → absolute
  {
    type: 'url',
    test: (raw) => {
      const t = raw.trim();
      return /^https?:\/\//i.test(t) || /^\/[^/]/.test(t) || /^www\./i.test(t);
    },
    parse: (raw) => {
      const trimmed = raw.trim();
      try {
        const absolute = new URL(trimmed, window.location.href).href;
        return { value: absolute, confidence: 0.95 };
      } catch {
        return { value: trimmed, confidence: 0.5 };
      }
    },
  },

  // Boolean: Yes/No, In Stock/Out of Stock, true/false
  {
    type: 'boolean',
    test: (raw) => {
      const t = raw.trim().toLowerCase();
      return /^(?:yes|no|true|false|in stock|out of stock|available|unavailable|enabled|disabled|active|inactive|on|off)$/i.test(t);
    },
    parse: (raw) => {
      const t = raw.trim().toLowerCase();
      const truthy = /^(?:yes|true|in stock|available|enabled|active|on)$/i.test(t);
      return { value: truthy, confidence: 0.9 };
    },
  },

  // List: comma/semicolon separated values
  {
    type: 'list',
    test: (raw) => {
      const t = raw.trim();
      // At least 2 items separated by comma or semicolon
      const parts = t.split(/[,;]\s*/);
      return parts.length >= 2 && parts.every(p => p.length > 0 && p.length < 100);
    },
    parse: (raw) => {
      const parts = raw.trim().split(/[,;]\s*/).map(p => p.trim()).filter(p => p.length > 0);
      return { value: parts, confidence: 0.7 };
    },
  },

  // Number: 1,234 → 1234, 1.5M, etc.
  {
    type: 'number',
    test: (raw) => /^\s*-?[\d,]+\.?\d*\s*[KMBkmb]?\s*$/.test(raw),
    parse: (raw) => {
      const trimmed = raw.trim();
      const suffix = trimmed.slice(-1).toUpperCase();
      let numStr = trimmed.replace(/[,\s]/g, '');

      let multiplier = 1;
      if (suffix === 'K') { multiplier = 1_000; numStr = numStr.slice(0, -1); }
      else if (suffix === 'M') { multiplier = 1_000_000; numStr = numStr.slice(0, -1); }
      else if (suffix === 'B') { multiplier = 1_000_000_000; numStr = numStr.slice(0, -1); }

      const num = parseFloat(numStr) * multiplier;
      return { value: num, confidence: isNaN(num) ? 0 : 0.9 };
    },
  },
];

/**
 * Auto-detect and parse a raw string value into a typed result.
 * Tries all parsers and returns the highest-confidence match.
 */
export function autoParseValue(raw: string): ParsedValue {
  if (!raw || typeof raw !== 'string') {
    return { type: 'string', value: raw, raw: raw || '', confidence: 1.0 };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { type: 'string', value: '', raw, confidence: 1.0 };
  }

  let best: ParsedValue = { type: 'string', value: trimmed, raw, confidence: 0.5 };

  for (const parser of parsers) {
    if (parser.test(trimmed)) {
      const result = parser.parse(trimmed);
      if (result.confidence > best.confidence) {
        best = { type: parser.type, value: result.value, raw, confidence: result.confidence };
      }
    }
  }

  return best;
}

/**
 * Parse a value with an explicit type hint.
 */
export function parseValueWithType(raw: string, type: ParsedType): ParsedValue {
  const parser = parsers.find(p => p.type === type);
  if (!parser) {
    return { type: 'string', value: raw, raw, confidence: 1.0 };
  }
  const result = parser.parse(raw);
  return { type, value: result.value, raw, confidence: result.confidence };
}

/**
 * Parse all values in an extraction result.
 * If schema has type hints ({ selector: ".price", type: "currency" }), use explicit parsing.
 * Otherwise, auto-detect types.
 */
export function parseExtractResult(
  data: Record<string, unknown>,
  typeHints?: Record<string, ParsedType>,
): Record<string, ParsedValue> {
  const parsed: Record<string, ParsedValue> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_')) continue; // skip meta keys

    if (Array.isArray(value)) {
      // Parse each item in the array
      const parsedItems = value.map(item => {
        if (typeof item !== 'string') return { type: 'string' as ParsedType, value: item, raw: String(item), confidence: 1.0 };
        const hint = typeHints?.[key];
        return hint ? parseValueWithType(item, hint) : autoParseValue(item);
      });
      parsed[key] = {
        type: parsedItems[0]?.type || 'string',
        value: parsedItems.map(p => p.value),
        raw: value.join(', '),
        confidence: parsedItems.reduce((sum, p) => sum + p.confidence, 0) / parsedItems.length,
      };
    } else if (typeof value === 'string') {
      const hint = typeHints?.[key];
      parsed[key] = hint ? parseValueWithType(value, hint) : autoParseValue(value);
    } else {
      parsed[key] = { type: 'string', value, raw: String(value), confidence: 1.0 };
    }
  }

  return parsed;
}

/**
 * Validate extracted values and return warnings.
 */
export function validateExtractResult(
  data: Record<string, unknown>,
  parsed: Record<string, ParsedValue>,
): string[] {
  const warnings: string[] = [];

  for (const [key, pv] of Object.entries(parsed)) {
    // Non-empty check
    if (pv.value === '' || pv.value === null || pv.value === undefined) {
      warnings.push(`${key}: empty value`);
    }

    // Anomaly detection for currency
    if (pv.type === 'currency') {
      const cur = pv.value as { value: number };
      if (cur.value > 1_000_000) warnings.push(`${key}: price looks unusually high (${cur.value})`);
      if (cur.value < 0) warnings.push(`${key}: negative price detected (${cur.value})`);
    }

    // Anomaly detection for ratings
    if (pv.type === 'rating') {
      const rating = pv.value as { value: number; max: number };
      if (rating.value > rating.max) warnings.push(`${key}: rating ${rating.value} exceeds max ${rating.max}`);
      if (rating.value < 0) warnings.push(`${key}: negative rating detected`);
    }
  }

  return warnings;
}
