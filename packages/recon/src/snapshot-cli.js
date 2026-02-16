#!/usr/bin/env npx tsx
"use strict";
/**
 * Standalone snapshot CLI — captures a site snapshot without needing an LLM.
 *
 * Usage:
 *   npx tsx packages/recon/src/snapshot-cli.ts <url> [--output <file>] [--cdp-url <url>]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("./snapshot/index.js");
const node_fs_1 = require("node:fs");
function usage() {
    console.error(`Usage: snapshot-cli <url> [--output <file>] [--cdp-url <url>]

Arguments:
  <url>              URL to snapshot (required)

Options:
  --output <file>    Write JSON to file (default: stdout)
  --cdp-url <url>    Chrome DevTools Protocol URL
                     (default: PINGDEV_CDP_URL or http://127.0.0.1:9222)`);
    process.exit(1);
}
function parseArgs(argv) {
    const args = argv.slice(2);
    let url;
    let output;
    let cdpUrl;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--output' || arg === '-o') {
            output = args[++i];
            if (!output) {
                console.error('--output requires a value');
                process.exit(1);
            }
        }
        else if (arg === '--cdp-url') {
            cdpUrl = args[++i];
            if (!cdpUrl) {
                console.error('--cdp-url requires a value');
                process.exit(1);
            }
        }
        else if (arg === '--help' || arg === '-h') {
            usage();
        }
        else if (!arg.startsWith('-')) {
            url = arg;
        }
        else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
    }
    if (!url)
        usage();
    return {
        url: url,
        output,
        cdpUrl: cdpUrl ?? process.env.PINGDEV_CDP_URL,
    };
}
/** Replace base64 screenshot data with a size placeholder to keep JSON readable. */
function stripScreenshots(snapshot) {
    return {
        ...snapshot,
        screenshots: snapshot.screenshots.map((s) => ({
            ...s,
            base64: `<${s.base64.length} bytes>`,
        })),
    };
}
async function main() {
    const { url, output, cdpUrl } = parseArgs(process.argv);
    const engine = new index_js_1.SnapshotEngine({ cdpUrl });
    try {
        console.error(`Snapshotting ${url} ...`);
        const snapshot = await engine.snapshot(url);
        const clean = stripScreenshots(snapshot);
        const json = JSON.stringify(clean, null, 2);
        if (output) {
            (0, node_fs_1.writeFileSync)(output, json, 'utf-8');
            console.error(`Snapshot written to ${output} (${(json.length / 1024).toFixed(1)} KB)`);
        }
        else {
            process.stdout.write(json + '\n');
        }
    }
    finally {
        await engine.close();
    }
}
main().catch((err) => {
    console.error('Snapshot failed:', err);
    process.exit(1);
});
//# sourceMappingURL=snapshot-cli.js.map