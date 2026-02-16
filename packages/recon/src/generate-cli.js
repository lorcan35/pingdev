#!/usr/bin/env npx tsx
"use strict";
/**
 * Standalone generator CLI — takes a SiteDefinitionResult JSON and scaffolds a PingApp.
 *
 * Usage:
 *   npx tsx packages/recon/src/generate-cli.ts --config <file> --output <dir> [--no-self-test]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const generator_js_1 = require("./generator/generator.js");
const self_test_js_1 = require("./generator/self-test.js");
function usage() {
    console.error(`Usage: generate-cli --config <file> --output <dir> [--no-self-test]

Options:
  --config <file>    Path to SiteDefinitionResult JSON (required)
  --output <dir>     Output directory for the generated PingApp (required)
  --no-self-test     Skip the compile-and-fix self-test loop`);
    process.exit(1);
}
function parseArgs(argv) {
    const args = argv.slice(2);
    let config;
    let output;
    let selfTest = true;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--config' || arg === '-c') {
            config = args[++i];
            if (!config) {
                console.error('--config requires a value');
                process.exit(1);
            }
        }
        else if (arg === '--output' || arg === '-o') {
            output = args[++i];
            if (!output) {
                console.error('--output requires a value');
                process.exit(1);
            }
        }
        else if (arg === '--no-self-test') {
            selfTest = false;
        }
        else if (arg === '--help' || arg === '-h') {
            usage();
        }
        else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
    }
    if (!config || !output)
        usage();
    return { config: config, output: (0, node_path_1.resolve)(output), selfTest };
}
async function main() {
    const opts = parseArgs(process.argv);
    // Read and parse the site definition JSON
    let siteDefinition;
    try {
        const raw = (0, node_fs_1.readFileSync)(opts.config, 'utf-8');
        siteDefinition = JSON.parse(raw);
    }
    catch (err) {
        console.error(`Failed to read config: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }
    console.error(`Generating PingApp "${siteDefinition.name}" → ${opts.output}`);
    const generator = new generator_js_1.PingAppGenerator();
    const generatorConfig = {
        outputDir: opts.output,
        siteDefinition,
        selfTest: opts.selfTest,
        maxRetries: 3,
    };
    const result = await generator.generate(generatorConfig);
    console.error(`Generated ${result.generatedFiles.length} files:`);
    for (const f of result.generatedFiles) {
        console.error(`  ${f}`);
    }
    // Self-test
    if (opts.selfTest) {
        console.error('\nRunning self-test (compile check) ...');
        const tester = new self_test_js_1.SelfTester();
        const testResult = await tester.test(opts.output);
        if (testResult.compiles) {
            console.error(`Self-test passed (${testResult.attempts} attempt(s))`);
        }
        else {
            console.error(`Self-test failed after ${testResult.attempts} attempt(s):`);
            for (const err of testResult.errors) {
                console.error(`  ${err}`);
            }
            process.exit(1);
        }
    }
    else {
        console.error('\nSelf-test skipped (--no-self-test)');
    }
    // Print summary to stdout as JSON
    console.log(JSON.stringify(result, null, 2));
}
main().catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
});
//# sourceMappingURL=generate-cli.js.map