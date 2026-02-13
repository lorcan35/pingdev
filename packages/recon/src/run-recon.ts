#!/usr/bin/env node
/**
 * CLI entry point for the full recon pipeline.
 * Usage: node dist/run-recon.js <url> [options]
 *
 * Options:
 *   --output <dir>         Output directory
 *   --snapshot-only        Just capture snapshot
 *   --analyze-only         Snapshot + analyze, no code gen
 *   --dry-run              Show what would be generated
 *   --no-self-test         Skip build verification
 *   --cdp-url <url>        CDP URL (default: PINGDEV_CDP_URL or http://127.0.0.1:9222)
 *   --llm-endpoint <url>   LLM endpoint (default: PINGDEV_LLM_URL)
 *   --llm-model <model>    LLM model (default: PINGDEV_LLM_MODEL)
 *
 * Env vars:
 *   PINGDEV_CDP_URL        CDP browser URL
 *   PINGDEV_LLM_URL        LLM API endpoint
 *   PINGDEV_LLM_MODEL      LLM model name
 */

import { runRecon } from './pipeline.js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);

function getFlag(name: string): string | boolean | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (next && !next.startsWith('--')) return next;
  return true;
}

const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('Usage: node dist/run-recon.js <url> [--output dir] [--snapshot-only] [--analyze-only] [--dry-run]');
  process.exit(1);
}

const outputDir = getFlag('output') as string | undefined;
const cdpUrl = getFlag('cdp-url') as string | undefined;
const llmEndpoint = getFlag('llm-endpoint') as string | undefined;
const llmModel = getFlag('llm-model') as string | undefined;

async function main() {
  console.log(`[recon] Starting full pipeline for ${url}`);
  if (cdpUrl || process.env.PINGDEV_CDP_URL) {
    console.log(`[recon] CDP: ${cdpUrl ?? process.env.PINGDEV_CDP_URL}`);
  }
  if (llmEndpoint || process.env.PINGDEV_LLM_URL) {
    console.log(`[recon] LLM: ${llmEndpoint ?? process.env.PINGDEV_LLM_URL}`);
  }
  if (llmModel || process.env.PINGDEV_LLM_MODEL) {
    console.log(`[recon] Model: ${llmModel ?? process.env.PINGDEV_LLM_MODEL}`);
  }

  const result = await runRecon({
    url: url!,
    cdpUrl,
    outputDir,
    llmEndpoint,
    llmModel,
    snapshotOnly: getFlag('snapshot-only') === true,
    analyzeOnly: getFlag('analyze-only') === true,
    dryRun: getFlag('dry-run') === true,
    selfTest: getFlag('no-self-test') !== true,
  });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[recon] Pipeline complete in ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`[recon] Status: ${result.status}`);

  if (result.snapshot) {
    console.log(`\n  Snapshot:`);
    console.log(`    Elements: ${result.snapshot.elements.length}`);
    console.log(`    Regions: ${result.snapshot.regions.length}`);
    console.log(`    Dynamic areas: ${result.snapshot.dynamicAreas.length}`);
  }

  if (result.analysis) {
    console.log(`\n  Analysis:`);
    console.log(`    Purpose: ${result.analysis.purpose}`);
    console.log(`    Category: ${result.analysis.category}`);
    console.log(`    Actions: ${result.analysis.actions.map((a) => a.name).join(', ')}`);
    console.log(`    States: ${result.analysis.states.map((s) => s.name).join(', ')}`);
    console.log(`    Selectors: ${Object.keys(result.analysis.selectors).join(', ')}`);
    if (result.analysis.features.length > 0) {
      console.log(`    Features: ${result.analysis.features.map((f) => f.name).join(', ')}`);
    }

    // Save analysis JSON
    const analysisPath = (outputDir ?? '.') + '/analysis.json';
    writeFileSync(analysisPath, JSON.stringify(result.analysis, null, 2));
    console.log(`    Saved analysis to ${analysisPath}`);
  }

  if (result.generation) {
    console.log(`\n  Generation:`);
    console.log(`    Output: ${result.generation.outputDir}`);
    console.log(`    Files: ${result.generation.generatedFiles.length}`);
    console.log(`    Compiles: ${result.generation.compiles}`);
    if (result.generation.buildErrors.length > 0) {
      console.log(`    Errors (${result.generation.buildErrors.length}):`);
      for (const err of result.generation.buildErrors.slice(0, 10)) {
        console.log(`      ${err}`);
      }
    }
    console.log(`    Fix attempts: ${result.generation.fixAttempts}`);
  }

  console.log(`${'═'.repeat(60)}`);
}

main().catch((err) => {
  console.error(`\n[recon] Fatal: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
