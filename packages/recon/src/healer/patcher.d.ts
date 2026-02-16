/** Selector file patcher — reads, patches, and writes selectors.ts files. */
import type { SelectorDef } from '@pingdev/core';
import type { HealingPatch } from './types.js';
/**
 * Read the selectors object from a PingApp's src/selectors.ts file.
 * Parses the TypeScript source using regex extraction.
 */
export declare function readSelectorsFile(appDir: string): Record<string, SelectorDef>;
/**
 * Write a complete selectors.ts file for a PingApp.
 * Generates valid TypeScript with the standard import statement.
 */
export declare function writeSelectorsFile(appDir: string, selectors: Record<string, SelectorDef>): void;
/**
 * Apply healing patches to a PingApp's selectors file.
 * Reads current selectors, applies patches, writes back, and returns the updated map.
 */
export declare function applyPatches(appDir: string, patches: HealingPatch[]): Record<string, SelectorDef>;
//# sourceMappingURL=patcher.d.ts.map