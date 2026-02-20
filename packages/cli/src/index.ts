#!/usr/bin/env node
/**
 * PingDev / PingOS CLI — create local API shims for any website.
 *
 * Commands:
 *   pingdev init <url>       — scaffold a new PingApp project
 *   pingdev serve            — start the local API server
 *   pingdev health           — check system health
 *   pingdev recon <url>      — auto-map a website into a PingApp config
 *
 * Lifecycle (pingos):
 *   pingos up [--daemon]     — start gateway + Chrome with extension
 *   pingos down              — stop the gateway
 *   pingos status            — show gateway, extension, and tab status
 *   pingos doctor            — check system health and diagnose issues
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
    console.error('  --cdp-url <url>   CDP endpoint URL (default: PINGDEV_CDP_URL or http://127.0.0.1:9222)');
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

  const cdpUrl = typeof flags['cdp-url'] === 'string' ? flags['cdp-url'] : (process.env.PINGDEV_CDP_URL ?? undefined);
  if (cdpUrl) {
    console.log(`[validate] CDP: ${cdpUrl}`);
  }
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
    console.error('  --cdp-url <url>       CDP endpoint URL (default: PINGDEV_CDP_URL or http://127.0.0.1:9222)');
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

  const cdpUrl = typeof flags['cdp-url'] === 'string' ? flags['cdp-url'] : (process.env.PINGDEV_CDP_URL ?? undefined);

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

async function runSuggestCommand(argv: string[]) {
  const device = argv[0];
  const question = argv.slice(1).join(' ');
  if (!device || !question) {
    console.error('Usage: pingdev suggest <device> <question>');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const context = typeof flags['context'] === 'string' ? flags['context'] : '';

  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/suggest`;
  const body = JSON.stringify({ question, context });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = await res.json() as any;
  if (!res.ok) {
    console.error(`[suggest] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  console.log(`Suggestion (confidence: ${data.confidence}):`);
  console.log(data.suggestion);
}

async function runRecordCommand(argv: string[]) {
  const sub = argv[0];
  const flags = parseFlags(argv.slice(1));
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const device = typeof flags['device'] === 'string' ? flags['device'] : argv[1];
  const baseUrl = `http://${host}:${port}`;

  if (!device && sub !== 'help') {
    console.error('Usage: pingdev record <start|stop|export|status> <device> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --name <name>   Name for exported workflow (export only)');
    console.error('  --host <host>   Gateway host (default: localhost)');
    console.error('  --port <port>   Gateway port (default: 3500)');
    process.exit(1);
  }

  switch (sub) {
    case 'start': {
      const res = await fetch(`${baseUrl}/v1/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      console.log('[record] Recording started on', device);
      break;
    }
    case 'stop': {
      const res = await fetch(`${baseUrl}/v1/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      console.log('[record] Recording stopped on', device);
      break;
    }
    case 'export': {
      const name = typeof flags['name'] === 'string' ? flags['name'] : 'recording';
      const res = await fetch(`${baseUrl}/v1/record/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, name }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      console.log(JSON.stringify(data.result, null, 2));
      break;
    }
    case 'status': {
      const res = await fetch(`${baseUrl}/v1/record/status?device=${encodeURIComponent(device!)}`, {
        method: 'GET',
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      console.log('[record] Status:', JSON.stringify(data.result, null, 2));
      break;
    }
    case 'replay': {
      const recordingFile = typeof flags['file'] === 'string' ? flags['file'] : '';
      if (!recordingFile) {
        console.error('[record] replay requires --file <recording.json>');
        process.exit(1);
      }
      const { readFileSync } = await import('node:fs');
      const recording = JSON.parse(readFileSync(recordingFile, 'utf-8'));
      const speed = typeof flags['speed'] === 'string' ? parseFloat(flags['speed']) : 0;
      const res = await fetch(`${baseUrl}/v1/recordings/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, recording, speed }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      const result = data.result;
      console.log(`Replay: ${result.successCount}/${result.steps.length} steps ok (${result.totalDurationMs}ms)`);
      for (const step of result.steps) {
        const icon = step.status === 'ok' ? 'OK' : 'ERR';
        console.log(`  [${icon}] ${step.action.type}${step.error ? ': ' + step.error : ''}`);
      }
      break;
    }
    case 'generate': {
      const recordingFile = typeof flags['file'] === 'string' ? flags['file'] : '';
      if (!recordingFile) {
        console.error('[record] generate requires --file <recording.json>');
        process.exit(1);
      }
      const { readFileSync } = await import('node:fs');
      const recording = JSON.parse(readFileSync(recordingFile, 'utf-8'));
      const appName = typeof flags['name'] === 'string' ? flags['name'] : undefined;
      const res = await fetch(`${baseUrl}/v1/recordings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording, name: appName }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[record] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      console.log(`Generated PingApp: ${data.app.manifest.name}`);
      console.log(`  URL: ${data.app.manifest.url}`);
      console.log(`  Actions: ${data.app.manifest.actionCount}`);
      console.log(`  Selectors: ${Object.keys(data.app.selectors).length}`);
      console.log(`  Files: ${Object.keys(data.files).join(', ')}`);
      if (flags['json']) {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }
    default:
      console.error('Usage: pingdev record <start|stop|export|status|replay|generate> <device> [options]');
      process.exit(1);
  }
}

async function runQueryCommand(argv: string[]) {
  const device = argv[0];
  const question = argv.slice(1).filter((a) => !a.startsWith('--')).join(' ');
  if (!device || !question) {
    console.error('Usage: pingdev query <device> <question>');
    console.error('');
    console.error('Options:');
    console.error('  --host <host>   Gateway host (default: localhost)');
    console.error('  --port <port>   Gateway port (default: 3500)');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';

  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    console.error(`[query] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  console.log(`Answer: ${data.answer}`);
  console.log(`Selector: ${data.selector}`);
  if (data.cached) console.log('(cached)');
  if (data.model) console.log(`Model: ${data.model}`);
}

async function runWatchCommand(argv: string[]) {
  const device = argv[0];
  if (!device) {
    console.error('Usage: pingdev watch <device> --schema \'{"key": "selector"}\' [--interval 5000]');
    console.error('');
    console.error('Options:');
    console.error('  --schema <json>    JSON mapping of field names to CSS selectors (required)');
    console.error('  --interval <ms>    Polling interval in milliseconds (default: 5000)');
    console.error('  --host <host>      Gateway host (default: localhost)');
    console.error('  --port <port>      Gateway port (default: 3500)');
    process.exit(1);
  }

  const flags = parseFlags(argv.slice(1));
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const schemaStr = typeof flags['schema'] === 'string' ? flags['schema'] : '';
  const interval = typeof flags['interval'] === 'string' ? parseInt(flags['interval'], 10) : 5000;

  if (!schemaStr) {
    console.error('[watch] Missing --schema flag. Example: --schema \'{"price": ".price-tag"}\'');
    process.exit(1);
  }

  let schema: Record<string, string> = {};
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    console.error('[watch] Invalid JSON in --schema');
    process.exit(1);
  }

  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/watch`;
  console.log('[watch] Connecting to SSE stream (Ctrl+C to stop)...');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema, interval }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    console.error(`[watch] Error: ${text}`);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        console.log(line.slice(6));
      }
    }
  }
}

async function runDiffCommand(argv: string[]) {
  const device = argv[0];
  if (!device) {
    console.error('Usage: pingdev diff <device> --schema \'{"key": "selector"}\'');
    console.error('');
    console.error('Options:');
    console.error('  --schema <json>  JSON mapping of field names to CSS selectors (required)');
    console.error('  --host <host>    Gateway host (default: localhost)');
    console.error('  --port <port>    Gateway port (default: 3500)');
    process.exit(1);
  }

  const flags = parseFlags(argv.slice(1));
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const schemaStr = typeof flags['schema'] === 'string' ? flags['schema'] : '';

  if (!schemaStr) {
    console.error('[diff] Missing --schema flag. Example: --schema \'{"price": ".price-tag"}\'');
    process.exit(1);
  }

  let schema: Record<string, string> = {};
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    console.error('[diff] Invalid JSON in --schema');
    process.exit(1);
  }

  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/diff`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    console.error(`[diff] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  if (data.isFirstExtraction) {
    console.log('[diff] First extraction — baseline captured.');
    console.log('Snapshot:', JSON.stringify(data.snapshot, null, 2));
  } else if (data.changes.length === 0) {
    console.log('[diff] No changes detected.');
  } else {
    console.log(`[diff] ${data.changes.length} change(s) detected:`);
    for (const c of data.changes) {
      console.log(`  ${c.field}: "${c.old}" -> "${c.new}"`);
    }
    if (data.unchanged.length > 0) {
      console.log(`  Unchanged: ${data.unchanged.join(', ')}`);
    }
  }
}

async function runDiscoverCommand(argv: string[]) {
  const device = argv.find((a) => !a.startsWith('--'));
  if (!device) {
    console.error('Usage: pingdev discover <device> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --host <host>   Gateway host (default: localhost)');
    console.error('  --port <port>   Gateway port (default: 3500)');
    console.error('  --json          Output raw JSON');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';

  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/discover`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json() as any;

  if (!res.ok) {
    console.error(`[discover] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  if (flags['json']) {
    console.log(JSON.stringify(data.result, null, 2));
  } else {
    const r = data.result;
    console.log(`Page type: ${r.pageType} (confidence: ${r.confidence})`);
    if (r.title) console.log(`Title: ${r.title}`);
    if (r.schemas && r.schemas.length > 0) {
      for (const schema of r.schemas) {
        console.log(`\nSchema: ${schema.name}`);
        for (const [field, def] of Object.entries(schema.fields)) {
          const f = def as any;
          console.log(`  ${field}: ${f.selector}${f.multiple ? ' (multiple)' : ''}`);
        }
      }
    }
  }
}

async function runCallCommand(argv: string[]) {
  // Format: pingdev call app.function --param1=val1 --param2=val2
  const functionName = argv.find((a) => !a.startsWith('--'));
  if (!functionName || !functionName.includes('.')) {
    console.error('Usage: pingdev call <app.function> [--param=value ...]');
    console.error('');
    console.error('Examples:');
    console.error('  pingdev call gmail.extract --schema \'{"subject": ".subject"}\'');
    console.error('  pingdev call amazon.click --selector ".add-to-cart"');
    console.error('');
    console.error('Options:');
    console.error('  --host <host>   Gateway host (default: localhost)');
    console.error('  --port <port>   Gateway port (default: 3500)');
    process.exit(1);
  }

  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const dotIdx = functionName.indexOf('.');
  const appName = functionName.slice(0, dotIdx);

  // Build params from flags (excluding host/port)
  const params: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flags)) {
    if (key === 'host' || key === 'port') continue;
    // Try parsing JSON values
    if (typeof val === 'string') {
      try {
        params[key] = JSON.parse(val);
      } catch {
        params[key] = val;
      }
    } else {
      params[key] = val;
    }
  }

  const url = `http://${host}:${port}/v1/functions/${encodeURIComponent(appName)}/call`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ function: functionName, params }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    console.error(`[call] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  console.log(JSON.stringify(data.result, null, 2));
}

async function runMcpCommand(argv: string[]) {
  const flags = parseFlags(argv);
  const useSSE = flags['sse'] === true;
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3600';

  if (useSSE) {
    console.log(`[mcp] Starting PingOS MCP server in SSE mode on port ${port}...`);
    console.log(`[mcp] SSE endpoint: GET http://localhost:${port}/sse`);
    console.log(`[mcp] Messages endpoint: POST http://localhost:${port}/messages`);
  } else {
    console.log('[mcp] Starting PingOS MCP server in stdio mode...');
    console.log('[mcp] Connect via Claude Desktop or Cursor.');
  }

  const { execFileSync, spawn } = await import('node:child_process');
  const { resolve } = await import('node:path');

  // Resolve the mcp-server entry point
  let mcpBin: string;
  try {
    // Try compiled dist first
    const distPath = resolve(__dirname, '../../mcp-server/dist/index.js');
    const { existsSync } = await import('node:fs');
    if (existsSync(distPath)) {
      mcpBin = distPath;
    } else {
      // Fallback to tsx for development
      mcpBin = resolve(__dirname, '../../mcp-server/src/index.ts');
    }
  } catch {
    console.error('[mcp] Could not locate MCP server. Run `npm run build` first.');
    process.exit(1);
  }

  const mcpArgs: string[] = [];
  if (useSSE) {
    mcpArgs.push('--sse', '--port', port);
  }

  // Spawn the MCP server process; inherit stdio for stdio mode
  const child = spawn(process.execPath, [mcpBin, ...mcpArgs], {
    stdio: useSSE ? ['ignore', 'inherit', 'inherit'] : 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    console.error(`[mcp] Failed to start MCP server: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Forward termination signals
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

async function runFunctionsCommand(argv: string[]) {
  const appName = argv.find((a) => !a.startsWith('--'));
  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';

  const path = appName ? `/v1/functions/${encodeURIComponent(appName)}` : '/v1/functions';
  const url = `http://${host}:${port}${path}`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json() as any;

  if (!res.ok) {
    console.error(`[functions] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }

  if (flags['json']) {
    console.log(JSON.stringify(data.functions, null, 2));
  } else {
    const fns = data.functions || [];
    if (fns.length === 0) {
      console.log('No functions available. Connect browser tabs first.');
    } else {
      console.log(`Available functions (${fns.length}):`);
      for (const fn of fns) {
        const paramStr = (fn.params || []).map((p: any) => `${p.name}${p.required ? '' : '?'}: ${p.type}`).join(', ');
        console.log(`  ${fn.name}(${paramStr})`);
        console.log(`    ${fn.description}`);
      }
    }
  }
}

async function runUpCommand(argv: string[]) {
  const flags = parseFlags(argv);
  const { spawn, execSync } = await import('node:child_process');
  const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { homedir } = await import('node:os');

  const pingosDir = join(homedir(), '.pingos');
  if (!existsSync(pingosDir)) mkdirSync(pingosDir, { recursive: true });

  const gatewayScript = resolve(__dirname, '../../std/dist/main.js');
  if (!existsSync(gatewayScript)) {
    console.error('[up] Gateway not found at', gatewayScript);
    console.error('    Run: pnpm build');
    process.exit(1);
  }

  // Check if gateway is already running
  const pidFile = join(pingosDir, 'gateway.pid');
  if (existsSync(pidFile)) {
    const existingPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      process.kill(existingPid, 0); // test if alive
      console.log(`[up] Gateway already running (PID ${existingPid})`);
    } catch {
      // PID stale, clean up
    }
  }

  // Start gateway
  console.log('[up] Starting gateway...');
  const gatewayChild = spawn(process.execPath, [gatewayScript], {
    detached: flags['daemon'] === true,
    stdio: flags['daemon'] === true ? 'ignore' : ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
  });

  if (flags['daemon'] === true) {
    gatewayChild.unref();
  }

  writeFileSync(pidFile, String(gatewayChild.pid));
  console.log(`[up] Gateway started (PID ${gatewayChild.pid})`);

  // Find Chrome
  let chromePath = typeof flags['chrome-path'] === 'string' ? flags['chrome-path'] : '';
  if (!chromePath) {
    const candidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    for (const c of candidates) {
      try {
        execSync(`which ${c}`, { stdio: 'ignore' });
        chromePath = c;
        break;
      } catch { /* not found */ }
    }
  }

  if (!chromePath) {
    console.error('[up] Chrome/Chromium not found. Use --chrome-path <path>');
    process.exit(1);
  }

  // Launch Chrome with extension
  const extDir = resolve(__dirname, '../../chrome-extension/dist');
  const profileDir = join(pingosDir, 'chrome-profile');
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });

  console.log(`[up] Launching Chrome: ${chromePath}`);
  const chromeChild = spawn(chromePath, [
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    `--user-data-dir=${profileDir}`,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  chromeChild.unref();

  // Poll for extension connection (up to 15 seconds)
  console.log('[up] Waiting for extension to connect...');
  const startTime = Date.now();
  let connected = false;
  while (Date.now() - startTime < 15000) {
    try {
      const res = await fetch('http://localhost:3500/v1/devices');
      if (res.ok) {
        const data = await res.json() as any;
        const devices = data.devices || [];
        if (devices.length > 0) {
          connected = true;
          console.log(`[up] Connected! ${devices.length} tab(s) available`);
          break;
        }
      }
    } catch { /* gateway not ready yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!connected) {
    console.log('[up] Extension not yet connected (gateway may still be starting)');
    console.log('    Run: pingos status');
  }

  console.log('');
  console.log('PingOS is running!');
  console.log(`  Gateway: http://localhost:3500`);
  console.log(`  PID file: ${pidFile}`);

  if (!flags['daemon']) {
    // Keep alive - forward signals
    process.on('SIGINT', () => {
      try { process.kill(gatewayChild.pid!, 'SIGTERM'); } catch {}
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      try { process.kill(gatewayChild.pid!, 'SIGTERM'); } catch {}
      process.exit(0);
    });
    // Don't exit — let gateway stdout keep us alive
    await new Promise(() => {}); // block forever in non-daemon mode
  }
}

async function runDownCommand(argv: string[]) {
  const flags = parseFlags(argv);
  const { existsSync, readFileSync, unlinkSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');

  const pingosDir = join(homedir(), '.pingos');
  const pidFile = join(pingosDir, 'gateway.pid');

  let killed = false;

  // Try PID file first
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[down] Stopped gateway (PID ${pid})`);
      killed = true;
    } catch {
      console.log(`[down] Gateway process ${pid} not running`);
    }
    unlinkSync(pidFile);
  }

  // Fallback: find process listening on port 3500
  if (!killed) {
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync('lsof -ti :3500 2>/dev/null || fuser 3500/tcp 2>/dev/null || true', { encoding: 'utf-8' }).trim();
      if (output) {
        const pids = output.split(/\s+/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log(`[down] Killed process on port 3500 (PID ${pid})`);
            killed = true;
          } catch { /* already dead */ }
        }
      }
    } catch { /* lsof/fuser not available */ }
  }

  if (!killed) {
    console.log('[down] No gateway process found');
  }

  if (flags['close-chrome'] === true) {
    console.log('[down] Note: --close-chrome not implemented (close Chrome manually)');
  }

  console.log('[down] Done');
}

async function runStatusCommand(argv: string[]) {
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');

  const pingosDir = join(homedir(), '.pingos');
  const pidFile = join(pingosDir, 'gateway.pid');

  // ANSI colors
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  console.log(bold('PingOS Status'));
  console.log('');

  // Gateway process
  let gatewayRunning = false;
  let gatewayPid = 0;
  if (existsSync(pidFile)) {
    gatewayPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      process.kill(gatewayPid, 0);
      gatewayRunning = true;
    } catch {
      gatewayRunning = false;
    }
  }

  if (gatewayRunning) {
    console.log(`  Gateway:    ${green('running')} ${dim(`(PID ${gatewayPid}, port 3500)`)}`);
  } else {
    console.log(`  Gateway:    ${red('stopped')}`);
  }

  // Try API
  let devices: any[] = [];
  let extensionConnected = false;
  try {
    const res = await fetch('http://localhost:3500/v1/devices');
    if (res.ok) {
      const data = await res.json() as any;
      devices = data.devices || [];
      extensionConnected = devices.length > 0;

      if (extensionConnected) {
        console.log(`  Extension:  ${green('connected')} ${dim(`(${devices.length} tab(s))`)}`);
      } else {
        console.log(`  Extension:  ${yellow('no tabs registered')}`);
      }
    } else {
      console.log(`  Extension:  ${red('gateway error')}`);
    }
  } catch {
    console.log(`  Extension:  ${red('cannot reach gateway')}`);
  }

  // Tabs
  if (devices.length > 0) {
    console.log('');
    console.log(bold('  Tabs:'));
    for (const d of devices) {
      const title = (d.title || 'Untitled').slice(0, 50);
      const url = (d.url || '').slice(0, 60);
      console.log(`    ${green(d.id)} ${title}`);
      console.log(`      ${dim(url)}`);
    }
  }

  // Watches & recordings (if gateway is up)
  if (gatewayRunning || devices.length > 0) {
    try {
      const watchRes = await fetch('http://localhost:3500/v1/watches');
      if (watchRes.ok) {
        const watchData = await watchRes.json() as any;
        const watchCount = watchData.watches?.length || 0;
        console.log('');
        console.log(`  Watches:    ${watchCount > 0 ? yellow(String(watchCount) + ' active') : dim('none')}`);
      }
    } catch { /* endpoint may not exist */ }

    try {
      const recRes = await fetch('http://localhost:3500/v1/recordings');
      if (recRes.ok) {
        const recData = await recRes.json() as any;
        const recCount = recData.recordings?.length || 0;
        console.log(`  Recordings: ${recCount > 0 ? yellow(String(recCount) + ' active') : dim('none')}`);
      }
    } catch { /* endpoint may not exist */ }
  }

  console.log('');
}

async function runDoctorCommand(argv: string[]) {
  const { existsSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { homedir } = await import('node:os');
  const { execSync } = await import('node:child_process');

  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  const pass = (label: string, detail?: string) => {
    console.log(`  ${green('PASS')}  ${label}${detail ? '  ' + dim(detail) : ''}`);
    return true;
  };
  const fail = (label: string, fix?: string) => {
    console.log(`  ${red('FAIL')}  ${label}`);
    if (fix) console.log(`        ${dim('Fix: ' + fix)}`);
    return false;
  };

  console.log(bold('PingOS Doctor'));
  console.log('');

  let allPass = true;

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split('.')[0], 10);
  if (major >= 18) {
    pass('Node.js', `v${nodeVersion}`);
  } else {
    allPass = false;
    fail('Node.js version', `Found v${nodeVersion}, need >= 18`);
  }

  // 2. Gateway binary
  const gatewayScript = resolve(__dirname, '../../std/dist/main.js');
  if (existsSync(gatewayScript)) {
    pass('Gateway binary', gatewayScript);
  } else {
    allPass = false;
    fail('Gateway binary not found', 'Run: pnpm build');
  }

  // 3. Port 3500
  let portInUse = false;
  try {
    const res = await fetch('http://localhost:3500/v1/devices');
    if (res.ok) {
      portInUse = true;
      pass('Port 3500', 'gateway is running');
    } else {
      portInUse = true;
      pass('Port 3500', 'in use (gateway responding)');
    }
  } catch {
    // Port is free or gateway not running
    try {
      execSync('lsof -ti :3500 2>/dev/null', { encoding: 'utf-8' });
      portInUse = true;
      allPass = false;
      fail('Port 3500', 'In use by another process. Run: lsof -ti :3500');
    } catch {
      pass('Port 3500', 'available');
    }
  }

  // 4. Chrome/Chromium
  let chromePath = '';
  const candidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
  for (const c of candidates) {
    try {
      execSync(`which ${c} 2>/dev/null`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      chromePath = c;
      break;
    } catch { /* not found */ }
  }
  if (chromePath) {
    pass('Chrome/Chromium', chromePath);
  } else {
    allPass = false;
    fail('Chrome/Chromium not found', 'Install Chrome or Chromium, or use --chrome-path with pingos up');
  }

  // 5. Extension dist
  const extDir = resolve(__dirname, '../../chrome-extension/dist');
  const manifestPath = join(extDir, 'manifest.json');
  if (existsSync(extDir) && existsSync(manifestPath)) {
    pass('Extension dist', extDir);
  } else {
    allPass = false;
    fail('Extension dist not found', 'Run: cd packages/chrome-extension && node build.mjs');
  }

  // 6. If gateway running, check devices
  if (portInUse) {
    try {
      const res = await fetch('http://localhost:3500/v1/devices');
      if (res.ok) {
        const data = await res.json() as any;
        const devices = data.devices || [];
        if (devices.length > 0) {
          pass('Extension connected', `${devices.length} tab(s)`);
        } else {
          pass('Gateway API responding', 'no tabs connected yet');
        }
      }
    } catch { /* already handled */ }
  }

  console.log('');
  if (allPass) {
    console.log(green('All checks passed!'));
  } else {
    console.log(red('Some checks failed. See fix suggestions above.'));
    process.exit(1);
  }
}

// Helper: generic device op CLI runner
async function runDeviceOp(
  op: string,
  argv: string[],
  parseBody: (argv: string[]) => Record<string, unknown> | null,
  usage: string,
) {
  const device = argv.filter((a) => !a.startsWith('--'))[0];
  if (!device) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  const body = parseBody(argv);
  if (body === null) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  const flags = parseFlags(argv);
  const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
  const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
  const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/${op}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    console.error(`[${op}] Error: ${data.message || res.statusText}`);
    process.exit(1);
  }
  console.log(JSON.stringify(data.result ?? data, null, 2));
}

function cliErr(cmd: string) {
  return (err: Error) => {
    console.error(`[${cmd}] Fatal error: ${err.message || err}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  };
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
  case 'suggest':
    runSuggestCommand(args.slice(1)).catch((err) => {
      console.error(`[suggest] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'record':
    runRecordCommand(args.slice(1)).catch((err) => {
      console.error(`[record] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'query':
    runQueryCommand(args.slice(1)).catch((err) => {
      console.error(`[query] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'watch':
    runWatchCommand(args.slice(1)).catch((err) => {
      console.error(`[watch] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'diff':
    runDiffCommand(args.slice(1)).catch((err) => {
      console.error(`[diff] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'discover':
    runDiscoverCommand(args.slice(1)).catch((err) => {
      console.error(`[discover] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'call':
    runCallCommand(args.slice(1)).catch((err) => {
      console.error(`[call] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'functions':
    runFunctionsCommand(args.slice(1)).catch((err) => {
      console.error(`[functions] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'pipe':
    (async () => {
      const pipeStr = args.slice(1).filter((a) => !a.startsWith('--')).join(' ');
      if (!pipeStr) {
        console.error('Usage: pingdev pipe \'extract:amazon:.price | type:slack:#deals\'');
        process.exit(1);
      }
      const flags = parseFlags(args.slice(1));
      const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
      const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
      const res = await fetch(`http://${host}:${port}/v1/pipelines/pipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipe: pipeStr }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        console.error(`[pipe] Error: ${data.message || res.statusText}`);
        process.exit(1);
      }
      const result = data.result;
      console.log(`Pipeline "${result.name}" completed in ${result.durationMs}ms`);
      for (const step of result.steps) {
        const icon = step.status === 'ok' ? 'OK' : step.status === 'skipped' ? 'SKIP' : 'ERR';
        console.log(`  [${icon}] ${step.id}${step.error ? ': ' + step.error : ''}`);
      }
      if (Object.keys(result.variables).length > 0) {
        console.log('\nVariables:');
        for (const [k, v] of Object.entries(result.variables)) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    })().catch((err) => {
      console.error(`[pipe] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'mcp':
    runMcpCommand(args.slice(1)).catch((err) => {
      console.error(`[mcp] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'up':
    runUpCommand(args.slice(1)).catch((err) => {
      console.error(`[up] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'down':
    runDownCommand(args.slice(1)).catch((err) => {
      console.error(`[down] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'status':
    runStatusCommand(args.slice(1)).catch((err) => {
      console.error(`[status] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'doctor':
    runDoctorCommand(args.slice(1)).catch((err) => {
      console.error(`[doctor] Fatal error: ${err.message || err}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
    break;
  case 'fill':
    runDeviceOp('fill', args.slice(1), (argv) => {
      const fieldsStr = argv.filter((a) => !a.startsWith('--')).slice(1).join(' ');
      if (!fieldsStr) return null;
      try { return { fields: JSON.parse(fieldsStr) }; } catch { return null; }
    }, 'pingdev fill <device> \'{"Email": "user@test.com"}\'').catch(cliErr('fill'));
    break;
  case 'wait':
    runDeviceOp('wait', args.slice(1), (argv) => {
      const flags = parseFlags(argv);
      const condition = argv.filter((a) => !a.startsWith('--'))[1];
      if (!condition) return null;
      const body: Record<string, unknown> = { condition };
      if (typeof flags['selector'] === 'string') body.selector = flags['selector'];
      if (typeof flags['text'] === 'string') body.text = flags['text'];
      if (typeof flags['timeout'] === 'string') body.timeout = parseInt(flags['timeout'] as string, 10);
      return body;
    }, 'pingdev wait <device> <condition> [--selector sel] [--text txt] [--timeout ms]').catch(cliErr('wait'));
    break;
  case 'table':
    runDeviceOp('table', args.slice(1), (argv) => {
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = {};
      if (typeof flags['selector'] === 'string') body.selector = flags['selector'];
      if (typeof flags['index'] === 'string') body.index = parseInt(flags['index'] as string, 10);
      return body;
    }, 'pingdev table <device> [--selector sel] [--index n]').catch(cliErr('table'));
    break;
  case 'dialog':
    runDeviceOp('dialog', args.slice(1), (argv) => {
      const action = argv.filter((a) => !a.startsWith('--'))[1] || 'detect';
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = { action };
      if (typeof flags['text'] === 'string') body.text = flags['text'];
      return body;
    }, 'pingdev dialog <device> [detect|dismiss|accept|interact] [--text btn]').catch(cliErr('dialog'));
    break;
  case 'paginate':
    runDeviceOp('paginate', args.slice(1), (argv) => {
      const action = argv.filter((a) => !a.startsWith('--'))[1] || 'detect';
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = { action };
      if (typeof flags['page'] === 'string') body.page = parseInt(flags['page'] as string, 10);
      return body;
    }, 'pingdev paginate <device> [detect|next|prev|goto] [--page n]').catch(cliErr('paginate'));
    break;
  case 'select-option':
    runDeviceOp('selectOption', args.slice(1), (argv) => {
      const flags = parseFlags(argv);
      const selector = argv.filter((a) => !a.startsWith('--'))[1];
      if (!selector) return null;
      const body: Record<string, unknown> = { selector };
      if (typeof flags['value'] === 'string') body.value = flags['value'];
      if (typeof flags['text'] === 'string') body.text = flags['text'];
      if (typeof flags['search'] === 'string') body.search = flags['search'];
      return body;
    }, 'pingdev select-option <device> <selector> [--value v] [--text t] [--search s]').catch(cliErr('select-option'));
    break;
  case 'navigate':
    runDeviceOp('smartNavigate', args.slice(1), (argv) => {
      const to = argv.filter((a) => !a.startsWith('--')).slice(1).join(' ');
      if (!to) return null;
      return { to };
    }, 'pingdev navigate <device> <keyword_or_url>').catch(cliErr('navigate'));
    break;
  case 'hover':
    runDeviceOp('hover', args.slice(1), (argv) => {
      const selector = argv.filter((a) => !a.startsWith('--'))[1];
      if (!selector) return null;
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = { selector };
      if (typeof flags['duration'] === 'string') body.duration_ms = parseInt(flags['duration'] as string, 10);
      return body;
    }, 'pingdev hover <device> <selector> [--duration ms]').catch(cliErr('hover'));
    break;
  case 'assert':
    runDeviceOp('assert', args.slice(1), (argv) => {
      const jsonStr = argv.filter((a) => !a.startsWith('--')).slice(1).join(' ');
      if (!jsonStr) return null;
      try { return { assertions: JSON.parse(jsonStr) }; } catch { return null; }
    }, 'pingdev assert <device> \'[{"type":"exists","selector":"#foo"}]\'').catch(cliErr('assert'));
    break;
  case 'network':
    runDeviceOp('network', args.slice(1), (argv) => {
      const action = argv.filter((a) => !a.startsWith('--'))[1] || 'list';
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = { action };
      if (typeof flags['url'] === 'string' || typeof flags['method'] === 'string') {
        body.filter = {};
        if (typeof flags['url'] === 'string') (body.filter as Record<string, string>).url = flags['url'] as string;
        if (typeof flags['method'] === 'string') (body.filter as Record<string, string>).method = flags['method'] as string;
      }
      return body;
    }, 'pingdev network <device> [start|stop|list] [--url pat] [--method GET]').catch(cliErr('network'));
    break;
  case 'storage':
    runDeviceOp('storage', args.slice(1), (argv) => {
      const positional = argv.filter((a) => !a.startsWith('--'));
      const action = positional[1] || 'list';
      const store = positional[2] || 'local';
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = { action, store };
      if (typeof flags['key'] === 'string') body.key = flags['key'];
      if (typeof flags['value'] === 'string') body.value = flags['value'];
      return body;
    }, 'pingdev storage <device> <action> <store> [--key k] [--value v]').catch(cliErr('storage'));
    break;
  case 'capture':
    runDeviceOp('capture', args.slice(1), (argv) => {
      const format = argv.filter((a) => !a.startsWith('--'))[1] || 'dom';
      return { format };
    }, 'pingdev capture <device> [dom|pdf|mhtml|har]').catch(cliErr('capture'));
    break;
  case 'download':
    runDeviceOp('download', args.slice(1), (argv) => {
      const flags = parseFlags(argv);
      const body: Record<string, unknown> = {};
      if (typeof flags['url'] === 'string') body.url = flags['url'];
      if (typeof flags['selector'] === 'string') body.selector = flags['selector'];
      if (typeof flags['save'] === 'string') body.savePath = flags['save'];
      return body;
    }, 'pingdev download <device> [--url u] [--selector s] [--save path]').catch(cliErr('download'));
    break;
  case 'annotate':
    runDeviceOp('annotate', args.slice(1), (argv) => {
      const jsonStr = argv.filter((a) => !a.startsWith('--')).slice(1).join(' ');
      if (!jsonStr) return null;
      try { return { annotations: JSON.parse(jsonStr) }; } catch { return null; }
    }, 'pingdev annotate <device> \'[{"selector":"#foo","label":"Click here"}]\'').catch(cliErr('annotate'));
    break;
  case 'init':
    console.log('pingdev init — not yet implemented (Phase 2)');
    break;
  case 'health':
    console.log('pingdev health — not yet implemented (Phase 2)');
    break;
  case 'extract':
    (async () => {
      const device = args.slice(1).filter((a) => !a.startsWith('--'))[0];
      if (!device) {
        console.error('Usage: pingdev extract <device> [options]');
        console.error('');
        console.error('Options:');
        console.error('  --auto             Zero-config extraction (no schema needed)');
        console.error('  --schema <json>    Schema mapping: \'{"title": "h1", "price": ".price"}\'');
        console.error('  --query <text>     Natural language extraction query');
        console.error('  --semantic <text>  LLM-powered semantic extraction');
        console.error('  --visual           Use screenshot-based extraction');
        console.error('  --paginate         Extract across multiple pages');
        console.error('  --max-pages <n>    Max pages when paginating (default 10)');
        console.error('  --fallback visual  Fallback to visual if DOM extract fails');
        console.error('  --host <host>      Gateway host (default: localhost)');
        console.error('  --port <port>      Gateway port (default: 3500)');
        process.exit(1);
      }
      const flags = parseFlags(args.slice(1));
      const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
      const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';

      // Build the extract payload
      const body: Record<string, unknown> = {};
      if (typeof flags['schema'] === 'string') {
        try { body.schema = JSON.parse(flags['schema'] as string); }
        catch { console.error('[extract] Invalid JSON in --schema'); process.exit(1); }
      }
      if (typeof flags['query'] === 'string') body.query = flags['query'];
      if (flags['visual']) body.strategy = 'visual';
      if (flags['paginate']) {
        body.paginate = true;
        if (typeof flags['max-pages'] === 'string') body.maxPages = parseInt(flags['max-pages'] as string, 10);
      }
      if (typeof flags['fallback'] === 'string') body.fallback = flags['fallback'];

      // Semantic mode
      if (typeof flags['semantic'] === 'string') {
        const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/extract/semantic`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: flags['semantic'] }),
        });
        const data = await res.json() as any;
        if (!res.ok) { console.error(`[extract] Error: ${data.message || res.statusText}`); process.exit(1); }
        console.log(JSON.stringify(data.result ?? data, null, 2));
        return;
      }

      // Normal extract (auto, schema, query, visual, paginate)
      const url = `http://${host}:${port}/v1/dev/${encodeURIComponent(device)}/extract`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as any;
      if (!res.ok) { console.error(`[extract] Error: ${data.message || res.statusText}`); process.exit(1); }
      console.log(JSON.stringify(data.result ?? data, null, 2));
    })().catch(cliErr('extract'));
    break;
  case 'templates':
    (async () => {
      const sub = args[1];
      const flags = parseFlags(args.slice(1));
      const host = typeof flags['host'] === 'string' ? flags['host'] : 'localhost';
      const port = typeof flags['port'] === 'string' ? flags['port'] : '3500';
      const baseUrl = `http://${host}:${port}`;

      switch (sub) {
        case 'list':
        case undefined: {
          const res = await fetch(`${baseUrl}/v1/templates`);
          const data = await res.json() as any;
          if (!res.ok) { console.error(`[templates] Error: ${data.message || res.statusText}`); process.exit(1); }
          const templates = data.templates || [];
          if (templates.length === 0) {
            console.log('No saved templates.');
          } else {
            console.log(`${templates.length} template(s):\n`);
            for (const t of templates) {
              const rate = (t.successRate * 100).toFixed(0);
              console.log(`  ${t.domain}  (${t.hitCount} hits, ${rate}% success)`);
              console.log(`    URL pattern: ${t.urlPattern}`);
            }
          }
          break;
        }
        case 'get': {
          const domain = args[2];
          if (!domain) { console.error('Usage: pingdev templates get <domain>'); process.exit(1); }
          const res = await fetch(`${baseUrl}/v1/templates/${encodeURIComponent(domain)}`);
          const data = await res.json() as any;
          if (!res.ok) { console.error(`[templates] Error: ${data.message || res.statusText}`); process.exit(1); }
          console.log(JSON.stringify(data.template ?? data, null, 2));
          break;
        }
        case 'delete': {
          const domain = args[2];
          if (!domain) { console.error('Usage: pingdev templates delete <domain>'); process.exit(1); }
          const res = await fetch(`${baseUrl}/v1/templates/${encodeURIComponent(domain)}`, { method: 'DELETE' });
          const data = await res.json() as any;
          if (!res.ok) { console.error(`[templates] Error: ${data.message || res.statusText}`); process.exit(1); }
          console.log(`Template for ${domain} deleted.`);
          break;
        }
        case 'export': {
          const domain = args[2];
          if (!domain) { console.error('Usage: pingdev templates export <domain>'); process.exit(1); }
          const res = await fetch(`${baseUrl}/v1/templates/${encodeURIComponent(domain)}/export`);
          const data = await res.json() as any;
          if (!res.ok) { console.error(`[templates] Error: ${data.message || res.statusText}`); process.exit(1); }
          console.log(JSON.stringify(data, null, 2));
          break;
        }
        case 'import': {
          const jsonStr = args.slice(2).filter((a) => !a.startsWith('--')).join(' ');
          if (!jsonStr) { console.error('Usage: pingdev templates import \'<json>\''); process.exit(1); }
          let template;
          try { template = JSON.parse(jsonStr); }
          catch { console.error('[templates] Invalid JSON'); process.exit(1); }
          const res = await fetch(`${baseUrl}/v1/templates/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(template),
          });
          const data = await res.json() as any;
          if (!res.ok) { console.error(`[templates] Error: ${data.message || res.statusText}`); process.exit(1); }
          console.log('Template imported successfully.');
          break;
        }
        default:
          console.error('Usage: pingdev templates [list|get|delete|export|import] [domain]');
          process.exit(1);
      }
    })().catch(cliErr('templates'));
    break;
  default:
    console.log('Usage: pingdev <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  recon <url>          Auto-map a website into a PingApp config');
    console.log('  validate <app-dir>   Validate a PingApp against a live site');
    console.log('  heal <app-dir>       Validate and auto-fix broken selectors');
    console.log('  serve <app-dir>      Show PingApp config and how to start');
    console.log('  suggest <dev> <q>    Get an LLM suggestion for a device');
    console.log('  record <sub> <dev>   Record workflows (start|stop|export|status)');
    console.log('  query <dev> <q>      Natural language query about a page');
    console.log('  watch <dev>          Watch for live data changes (SSE)');
    console.log('  diff <dev>           Differential extraction (track changes)');
    console.log('  discover <dev>       Auto-detect page type and extraction schemas');
    console.log('  call <app.fn>        Call a tab function (e.g. gmail.extract)');
    console.log('  functions [app]      List callable functions');
    console.log('  pipe \'expr\'          Cross-tab data pipe (e.g. extract:amazon:.price)');
    console.log('  mcp [--sse] [--port] Start MCP server for Claude Desktop / Cursor');
    console.log('  init <url>           Scaffold a new PingApp for the given URL');
    console.log('  health               Check system health');
    console.log('');
    console.log('Smart Extract:');
    console.log('  extract <dev>          Smart extraction (auto, schema, query, visual)');
    console.log('  templates [sub]        Manage extraction templates (list|get|delete|export|import)');
    console.log('');
    console.log('Core Ops:');
    console.log('  fill <dev> <json>      Smart form filling');
    console.log('  wait <dev> <cond>      Smart conditional wait');
    console.log('  table <dev>            Extract table data');
    console.log('  dialog <dev> [action]  Handle dialogs/modals/cookie banners');
    console.log('  paginate <dev> [act]   Auto-pagination');
    console.log('  select-option <dev>    Complex dropdown selection');
    console.log('  navigate <dev> <to>    Intelligent navigation by keyword/URL');
    console.log('  hover <dev> <sel>      Trigger hover state');
    console.log('  assert <dev> <json>    Run page assertions');
    console.log('  network <dev> <act>    Intercept network calls');
    console.log('  storage <dev> <act>    Browser storage access');
    console.log('  capture <dev> [fmt]    Rich page capture (dom)');
    console.log('  download <dev>         Trigger file download');
    console.log('  annotate <dev> <json>  Visual page annotations');
    console.log('');
    console.log('Lifecycle:');
    console.log('  up [--daemon]          Start gateway + Chrome with PingOS extension');
    console.log('  down                   Stop the gateway');
    console.log('  status                 Show gateway, extension, and tab status');
    console.log('  doctor                 Check system health and diagnose issues');
    process.exit(command ? 1 : 0);
}
