/** Selector file patcher — reads, patches, and writes selectors.ts files. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SelectorDef } from '@pingdev/core';
import type { HealingPatch } from './types.js';

const SELECTORS_REL_PATH = 'src/selectors.ts';

/**
 * Read the selectors object from a PingApp's src/selectors.ts file.
 * Parses the TypeScript source using regex extraction.
 */
export function readSelectorsFile(appDir: string): Record<string, SelectorDef> {
  const filePath = path.join(appDir, SELECTORS_REL_PATH);
  const source = fs.readFileSync(filePath, 'utf-8');

  const selectors: Record<string, SelectorDef> = {};

  // Match each selector block: key: { name: '...', tiers: [...], }
  const selectorRegex = /(\w+)\s*:\s*\{\s*name\s*:\s*['"]([^'"]+)['"]\s*,\s*tiers\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
  let match: RegExpExecArray | null;

  while ((match = selectorRegex.exec(source)) !== null) {
    const key = match[1]!;
    const name = match[2]!;
    const tiersRaw = match[3]!;

    // Extract individual tier strings (single-quoted)
    const tiers: string[] = [];
    const tierRegex = /'((?:[^'\\]|\\.)*)'/g;
    let tierMatch: RegExpExecArray | null;
    while ((tierMatch = tierRegex.exec(tiersRaw)) !== null) {
      tiers.push(tierMatch[1]!.replace(/\\'/g, "'"));
    }

    selectors[key] = { name, tiers };
  }

  return selectors;
}

/**
 * Write a complete selectors.ts file for a PingApp.
 * Generates valid TypeScript with the standard import statement.
 */
export function writeSelectorsFile(
  appDir: string,
  selectors: Record<string, SelectorDef>,
): void {
  const filePath = path.join(appDir, SELECTORS_REL_PATH);

  const entries = Object.entries(selectors)
    .map(([key, def]) => {
      const tiersStr = def.tiers
        .map((t) => `    '${t.replace(/'/g, "\\'")}'`)
        .join(',\n');
      return `  ${key}: {\n    name: '${def.name}',\n    tiers: [\n${tiersStr},\n    ],\n  }`;
    })
    .join(',\n');

  const content = `import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
${entries},
};
`;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Apply healing patches to a PingApp's selectors file.
 * Reads current selectors, applies patches, writes back, and returns the updated map.
 */
export function applyPatches(
  appDir: string,
  patches: HealingPatch[],
): Record<string, SelectorDef> {
  const selectors = readSelectorsFile(appDir);

  for (const patch of patches) {
    if (selectors[patch.selectorName]) {
      selectors[patch.selectorName]!.tiers = patch.newTiers;
    } else {
      // Add new selector if it doesn't exist
      selectors[patch.selectorName] = {
        name: patch.selectorName,
        tiers: patch.newTiers,
      };
    }
  }

  writeSelectorsFile(appDir, selectors);
  return selectors;
}
