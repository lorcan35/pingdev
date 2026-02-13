#!/usr/bin/env node
/**
 * Quick snapshot test script.
 * Usage: node dist/run-snapshot.js <url> [output-path]
 */

import { SnapshotEngine } from './snapshot/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'https://chatgpt.com';
const outputPath = process.argv[3] ?? 'snapshot.json';

async function main() {
  console.log(`[snapshot] Capturing ${url} ...`);
  const start = Date.now();

  const engine = new SnapshotEngine({
    screenshots: true,
    captureAriaTree: true,
    timeoutMs: 30_000,
  });

  try {
    const snapshot = await engine.snapshot(url);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`[snapshot] Done in ${elapsed}s`);
    console.log(`  Title: ${snapshot.title}`);
    console.log(`  Elements: ${snapshot.elements.length}`);
    console.log(`  Regions: ${snapshot.regions.length}`);
    console.log(`  Dynamic areas: ${snapshot.dynamicAreas.length}`);
    console.log(`  ARIA tree nodes: ${snapshot.ariaTree.length}`);
    console.log(`  Screenshots: ${snapshot.screenshots.length}`);
    console.log(`  Links: ${snapshot.links.length}`);
    console.log(`  Visible text chunks: ${snapshot.visibleText.length}`);

    // Show top interactive elements
    const interactive = snapshot.elements
      .filter((e) => e.interactiveConfidence >= 0.7)
      .sort((a, b) => b.interactiveConfidence - a.interactiveConfidence);
    console.log(`\n  Top interactive elements (${interactive.length}):`);
    for (const el of interactive.slice(0, 25)) {
      const region = el.regionName ? ` [${el.regionName}]` : '';
      const label = el.label ?? el.placeholder ?? el.textContent ?? '';
      console.log(`    ${el.type.padEnd(15)} ${el.name.slice(0, 30).padEnd(30)} ${label.slice(0, 40)}${region}`);
    }

    // Show regions
    console.log(`\n  Regions:`);
    for (const r of snapshot.regions) {
      console.log(`    ${r.name.padEnd(20)} (${r.role}) — ${r.elementIds.length} elements`);
    }

    // Show dynamic areas
    if (snapshot.dynamicAreas.length > 0) {
      console.log(`\n  Dynamic areas:`);
      for (const da of snapshot.dynamicAreas) {
        console.log(`    ${da.name.padEnd(25)} ${da.contentType.padEnd(20)} ${da.selector}`);
      }
    }

    // Save to file — strip base64 screenshots for readability
    const stripped = {
      ...snapshot,
      screenshots: snapshot.screenshots.map((s) => ({
        label: s.label,
        width: s.width,
        height: s.height,
        base64Length: s.base64.length,
      })),
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(stripped, null, 2));
    console.log(`\n  Saved to ${outputPath} (${(JSON.stringify(stripped).length / 1024).toFixed(0)} KB)`);
  } finally {
    await engine.close();
  }
}

main().catch((err) => {
  console.error(`[snapshot] Fatal: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
