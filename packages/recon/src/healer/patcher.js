"use strict";
/** Selector file patcher — reads, patches, and writes selectors.ts files. */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSelectorsFile = readSelectorsFile;
exports.writeSelectorsFile = writeSelectorsFile;
exports.applyPatches = applyPatches;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const SELECTORS_REL_PATH = 'src/selectors.ts';
/**
 * Read the selectors object from a PingApp's src/selectors.ts file.
 * Parses the TypeScript source using regex extraction.
 */
function readSelectorsFile(appDir) {
    const filePath = path.join(appDir, SELECTORS_REL_PATH);
    const source = fs.readFileSync(filePath, 'utf-8');
    const selectors = {};
    // Match each selector block: key: { name: '...', tiers: [...], }
    const selectorRegex = /(\w+)\s*:\s*\{\s*name\s*:\s*['"]([^'"]+)['"]\s*,\s*tiers\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
    let match;
    while ((match = selectorRegex.exec(source)) !== null) {
        const key = match[1];
        const name = match[2];
        const tiersRaw = match[3];
        // Extract individual tier strings (single-quoted)
        const tiers = [];
        const tierRegex = /'((?:[^'\\]|\\.)*)'/g;
        let tierMatch;
        while ((tierMatch = tierRegex.exec(tiersRaw)) !== null) {
            tiers.push(tierMatch[1].replace(/\\'/g, "'"));
        }
        selectors[key] = { name, tiers };
    }
    return selectors;
}
/**
 * Write a complete selectors.ts file for a PingApp.
 * Generates valid TypeScript with the standard import statement.
 */
function writeSelectorsFile(appDir, selectors) {
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
function applyPatches(appDir, patches) {
    const selectors = readSelectorsFile(appDir);
    for (const patch of patches) {
        if (selectors[patch.selectorName]) {
            selectors[patch.selectorName].tiers = patch.newTiers;
        }
        else {
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
//# sourceMappingURL=patcher.js.map