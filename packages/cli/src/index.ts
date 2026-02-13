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
    console.error('  --output <dir>     Override output directory (alias: --output-dir)');
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
    outputDir: typeof flags['output'] === 'string' ? flags['output'] : typeof flags['output-dir'] === 'string' ? flags['output-dir'] : undefined,
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

async function runValidateCommand(argv: string[]) {
  const appDir = argv.find((a) => !a.startsWith('--'));
  if (!appDir) {
    console.error('Usage: pingdev validate <app-dir> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --cdp-url <url>   CDP endpoint URL (default: http://127.0.0.1:18800)');
    console.error('  --timeout <ms>    Per-action timeout in ms (default: 15000)');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const { resolve } = await import('node:path');
  const resolvedDir = resolve(appDir);

  const {
    PingAppLoader,
    ActionValidator,
    scoring,
  } = require('@pingdev/core') as typeof import('@pingdev/core');

  console.log(`[validate] Loading PingApp from ${resolvedDir}...`);
  const loader = new PingAppLoader(resolvedDir);
  const config = loader.load();

  console.log(`[validate] App: ${config.name} (${config.url})`);
  console.log(`[validate] Selectors: ${Object.keys(config.selectors).length}`);
  console.log('');

  // Run ActionValidator against the live site
  const validator = new ActionValidator(config.selectors, config.url, {
    cdpUrl: typeof flags['cdp-url'] === 'string' ? flags['cdp-url'] : undefined,
    timeout: typeof flags['timeout'] === 'string' ? parseInt(flags['timeout'], 10) : undefined,
  });

  console.log('[validate] Running validation against live site...');
  const report = validator.validate();
  const validationReport = await report;

  // Print action results
  console.log('');
  console.log('=== Validation Results ===');
  for (const r of validationReport.results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.actionName} (${r.timing_ms}ms)${r.error ? ' — ' + r.error : ''}`);
  }

  // Run health scoring
  const healthReport = scoring.generateHealthReport(
    config.name,
    config.url,
    config.selectors,
  );

  console.log('');
  console.log('=== Health Score ===');
  console.log(`  Overall: ${healthReport.overallScore}/100`);

  if (healthReport.warnings.length > 0) {
    console.log('');
    console.log('  Warnings:');
    for (const w of healthReport.warnings.slice(0, 10)) {
      console.log(`    - ${w}`);
    }
  }

  if (healthReport.recommendations.length > 0) {
    console.log('');
    console.log('  Recommendations:');
    for (const r of healthReport.recommendations.slice(0, 10)) {
      console.log(`    - ${r}`);
    }
  }

  console.log('');
  console.log(`[validate] Done in ${(validationReport.duration_ms / 1000).toFixed(1)}s — ${validationReport.overallPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

  if (!validationReport.overallPassed) {
    process.exit(1);
  }
}

async function runHealCommand(argv: string[]) {
  const appDir = argv.find((a) => !a.startsWith('--'));
  if (!appDir) {
    console.error('Usage: pingdev heal <app-dir> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --cdp-url <url>       CDP endpoint URL (default: http://127.0.0.1:18800)');
    console.error('  --llm-endpoint <url>  LLM API endpoint URL');
    console.error('  --llm-model <model>   LLM model name');
    console.error('  --max-retries <n>     Max healing retries per action (default: 3)');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const { resolve } = await import('node:path');
  const resolvedDir = resolve(appDir);

  const {
    PingAppLoader,
    ActionValidator,
  } = require('@pingdev/core') as typeof import('@pingdev/core');

  const {
    Healer,
  } = require('@pingdev/recon') as typeof import('@pingdev/recon');

  // Step 1: Validate to find failures
  console.log(`[heal] Loading PingApp from ${resolvedDir}...`);
  const loader = new PingAppLoader(resolvedDir);
  const config = loader.load();

  console.log(`[heal] App: ${config.name} (${config.url})`);
  console.log('[heal] Running validation first...');

  const cdpUrl = typeof flags['cdp-url'] === 'string' ? flags['cdp-url'] : undefined;

  const validator = new ActionValidator(config.selectors, config.url, { cdpUrl });
  const validationReport = await validator.validate();

  const failedActions = validationReport.results
    .filter((r) => !r.passed)
    .map((r) => ({
      actionName: r.actionName,
      error: r.error ?? 'Unknown error',
      selectorName: r.actionName, // best guess: action name maps to selector name
    }));

  if (failedActions.length === 0) {
    console.log('[heal] All actions passed — nothing to heal.');
    return;
  }

  console.log(`[heal] ${failedActions.length} action(s) failed. Starting healing...`);

  // Step 2: Run Healer on failures
  const healer = new Healer(resolvedDir, {
    cdpUrl,
    llmEndpoint: typeof flags['llm-endpoint'] === 'string' ? flags['llm-endpoint'] : undefined,
    llmModel: typeof flags['llm-model'] === 'string' ? flags['llm-model'] : undefined,
    maxRetries: typeof flags['max-retries'] === 'string' ? parseInt(flags['max-retries'], 10) : undefined,
  });

  const result = await healer.heal(failedActions);

  // Print healing report
  console.log('');
  console.log('=== Healing Report ===');
  for (const report of result.reports) {
    const icon = report.fixed ? 'FIXED' : 'FAILED';
    console.log(`  [${icon}] ${report.actionName} (${report.attempts.length} attempt(s))`);
    if (report.fixed && report.finalPatches.length > 0) {
      for (const patch of report.finalPatches) {
        console.log(`    Patched: ${patch.selectorName}`);
        console.log(`      Old: ${JSON.stringify(patch.oldTiers)}`);
        console.log(`      New: ${JSON.stringify(patch.newTiers)}`);
      }
    }
  }

  console.log('');
  console.log(`[heal] Done in ${(result.duration_ms / 1000).toFixed(1)}s — fixed: ${result.totalFixed}, failed: ${result.totalFailed}`);

  if (result.totalFailed > 0) {
    process.exit(1);
  }
}

async function runServeCommand(argv: string[]) {
  const appDir = argv.find((a) => !a.startsWith('--'));
  if (!appDir) {
    console.error('Usage: pingdev serve <app-dir> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --self-heal  Enable runtime self-healing');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const { resolve } = await import('node:path');
  const resolvedDir = resolve(appDir);

  const { PingAppLoader } = require('@pingdev/core') as typeof import('@pingdev/core');

  const loader = new PingAppLoader(resolvedDir);
  const config = loader.load();

  console.log('=== PingApp Config ===');
  console.log(`  Name: ${config.name}`);
  console.log(`  URL:  ${config.url}`);
  console.log(`  Selectors: ${Object.keys(config.selectors).length}`);
  console.log(`  Self-healing: ${flags['self-heal'] === true ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log(`Run: node ${resolvedDir}/dist/index.js`);
  if (flags['self-heal'] === true) {
    console.log('  (Runtime self-healing is enabled — broken selectors will be auto-repaired)');
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
  case 'validate':
    runValidateCommand(args.slice(1)).catch((err) => {
      console.error(`[validate] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'heal':
    runHealCommand(args.slice(1)).catch((err) => {
      console.error(`[heal] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'serve':
    runServeCommand(args.slice(1)).catch((err) => {
      console.error(`[serve] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'init':
    console.log('pingdev init — not yet implemented (Phase 2)');
    break;
  case 'health':
    console.log('pingdev health — not yet implemented (Phase 2)');
    break;
  default:
    console.log('Usage: pingdev <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  recon <url>          Auto-map a website into a PingApp config');
    console.log('  validate <app-dir>   Validate a PingApp against a live site');
    console.log('  heal <app-dir>       Validate and auto-fix broken selectors');
    console.log('  serve <app-dir>      Show PingApp config and how to start');
    console.log('  init <url>           Scaffold a new PingApp for the given URL');
    console.log('  health               Check system health');
    process.exit(command ? 1 : 0);
}
