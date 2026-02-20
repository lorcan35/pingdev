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
    process.exit(command ? 1 : 0);
}
