// @pingdev/std — JSON repair helpers for local-model outputs

function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function fixUnquotedKeys(text: string): string {
  return text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');
}

function cleanJsonCandidate(text: string): string {
  return fixUnquotedKeys(fixTrailingCommas(text.trim()));
}

function findBalancedJsonCandidate(text: string, openChar: '{' | '['): string | null {
  const closeChar = openChar === '{' ? '}' : ']';
  const start = text.indexOf(openChar);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseOrNull(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function stripThinkBlocks(text: string): string {
  let cleaned = String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Also handle unclosed reasoning tags and orphan tag tokens.
  cleaned = cleaned
    .replace(/^\s*<think>[\s\S]*$/gi, '')
    .replace(/^\s*<thinking>[\s\S]*$/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?thinking>/gi, '');

  return cleaned;
}

export function stripCodeFences(text: string): string {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/```json/gi, '```').replace(/```/g, '').trim();
}

export function extractJsonFromText(text: string): string | null {
  const source = String(text ?? '').trim();
  if (!source) return null;

  const obj = findBalancedJsonCandidate(source, '{');
  const arr = findBalancedJsonCandidate(source, '[');

  if (!obj && !arr) return null;
  if (obj && !arr) return obj;
  if (!obj && arr) return arr;

  const objIndex = source.indexOf(obj!);
  const arrIndex = source.indexOf(arr!);
  return objIndex <= arrIndex ? obj : arr;
}

export function repairLLMJson(raw: string): any {
  const input = String(raw ?? '');
  if (!input.trim()) {
    throw new Error('Empty LLM response; cannot parse JSON');
  }

  const noThink = stripThinkBlocks(input);
  const noFence = stripCodeFences(noThink);

  const direct = parseOrNull(noFence);
  if (direct !== null) return direct;

  const extracted = extractJsonFromText(noFence);
  if (!extracted) {
    throw new Error(`No JSON object/array found in response: ${noFence.slice(0, 200)}`);
  }

  const cleaned = cleanJsonCandidate(extracted);
  const repaired = parseOrNull(cleaned);
  if (repaired !== null) return repaired;

  const objects = noFence.match(/\{[\s\S]*?\}/g) ?? [];
  const parsedObjects: any[] = [];
  for (const obj of objects) {
    const parsed = parseOrNull(cleanJsonCandidate(obj));
    if (parsed !== null) parsedObjects.push(parsed);
  }

  if (parsedObjects.length === 1) return parsedObjects[0];
  if (parsedObjects.length > 1) return parsedObjects;

  throw new Error(`Failed to repair JSON. Raw: ${input.slice(0, 200)} | Candidate: ${cleaned.slice(0, 200)}`);
}
