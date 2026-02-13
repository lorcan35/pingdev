#!/usr/bin/env node
/**
 * PingDev CLI — create local API shims for any website.
 *
 * Commands:
 *   pingdev init <url>       — scaffold a new PingApp project
 *   pingdev serve            — start the local API server
 *   pingdev health           — check system health
 *   pingdev recon <url>      — auto-map a website into a PingApp config
 */

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function runReconCommand(argv: string[]) {
  const url = argv.find((a) => !a.startsWith('--'));
  if (!url) {
    console.error('Usage: pingdev recon <url> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --snapshot-only    Just capture a snapshot, no analysis');
    console.error('  --analyze-only     Snapshot + analyze, no code generation');
    console.error('  --dry-run          Show what would be generated');
    console.error('  --output-dir <dir> Override output directory');
    console.error('  --llm-endpoint <u> LLM API endpoint URL');
    console.error('  --llm-model <m>    LLM model name');
    console.error('  --no-self-test     Skip build verification');
    process.exit(1);
  }

  const flags = parseFlags(argv);

  // Use require to avoid CJS/ESM interop issues with dynamic import
  const { runRecon } = require('@pingdev/recon') as typeof import('@pingdev/recon');

  const result = await runRecon({
    url,
    snapshotOnly: flags['snapshot-only'] === true,
    analyzeOnly: flags['analyze-only'] === true,
    dryRun: flags['dry-run'] === true,
    outputDir: typeof flags['output-dir'] === 'string' ? flags['output-dir'] : undefined,
    llmEndpoint: typeof flags['llm-endpoint'] === 'string' ? flags['llm-endpoint'] : undefined,
    llmModel: typeof flags['llm-model'] === 'string' ? flags['llm-model'] : undefined,
    selfTest: flags['no-self-test'] !== true,
  });

  console.log(`\n[recon] Done in ${(result.durationMs / 1000).toFixed(1)}s — status: ${result.status}`);

  if (result.snapshot) {
    console.log(`  Elements: ${result.snapshot.elements.length}`);
    console.log(`  Regions: ${result.snapshot.regions.length}`);
  }
  if (result.analysis) {
    console.log(`  Actions: ${result.analysis.actions.length}`);
    console.log(`  States: ${result.analysis.states.length}`);
  }
  if (result.generation) {
    console.log(`  Files: ${result.generation.generatedFiles.length}`);
    console.log(`  Compiles: ${result.generation.compiles}`);
    if (result.generation.buildErrors.length > 0) {
      console.log(`  Errors: ${result.generation.buildErrors.length}`);
    }
    console.log(`  Output: ${result.generation.outputDir}`);
  }

  // Write snapshot JSON to stdout if --snapshot-only
  if (flags['snapshot-only']) {
    const outPath = 'snapshot.json';
    const { writeFileSync } = await import('node:fs');
    // Strip base64 screenshots for the JSON file (too large)
    const stripped = {
      ...result.snapshot,
      screenshots: result.snapshot.screenshots.map((s: { base64: string }) => ({
        ...s,
        base64: `<${s.base64.length} bytes>`,
      })),
    };
    writeFileSync(outPath, JSON.stringify(stripped, null, 2));
    console.log(`  Snapshot written to ${outPath}`);
  }
}

switch (command) {
  case 'recon':
    runReconCommand(args.slice(1)).catch((err) => {
      console.error(`[recon] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'init':
    console.log('pingdev init — not yet implemented (Phase 2)');
    break;
  case 'serve':
    console.log('pingdev serve — not yet implemented (Phase 2)');
    break;
  case 'health':
    console.log('pingdev health — not yet implemented (Phase 2)');
    break;
  default:
    console.log('Usage: pingdev <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  recon <url>  Auto-map a website into a PingApp config');
    console.log('  init <url>   Scaffold a new PingApp for the given URL');
    console.log('  serve        Start the local API server');
    console.log('  health       Check system health');
    process.exit(command ? 1 : 0);
}
