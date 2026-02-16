"use strict";
/**
 * Recon Pipeline — orchestrates snapshot → analyzer → generator.
 *
 * `pingdev recon <url>` runs through all three stages and outputs a PingApp.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRecon = runRecon;
const index_js_1 = require("./snapshot/index.js");
const analyzer_js_1 = require("./analyzer/analyzer.js");
const doc_scraper_js_1 = require("./analyzer/doc-scraper.js");
const generator_js_1 = require("./generator/generator.js");
const self_test_js_1 = require("./generator/self-test.js");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
/** Derive a safe directory name from a URL. */
function siteNameFromUrl(url) {
    try {
        const u = new URL(url);
        return u.hostname
            .replace(/^www\./, '')
            .replace(/\./g, '-')
            .replace(/[^a-z0-9-]/gi, '');
    }
    catch {
        return 'unknown-site';
    }
}
/** Run the full recon pipeline. */
async function runRecon(options) {
    const start = Date.now();
    const { url } = options;
    // ── Stage 1: Snapshot ──────────────────────────────────────────
    console.log(`\n[recon] Snapshotting ${url} ...`);
    const snapshotEngine = new index_js_1.SnapshotEngine({
        cdpUrl: options.cdpUrl ?? process.env.PINGDEV_CDP_URL ?? 'http://127.0.0.1:9222',
        screenshots: true,
        captureAriaTree: true,
    });
    let snapshot;
    try {
        snapshot = await snapshotEngine.snapshot(url);
        console.log(`[recon] Snapshot complete: ${snapshot.elements.length} elements, ${snapshot.regions.length} regions`);
    }
    finally {
        await snapshotEngine.close();
    }
    if (options.snapshotOnly) {
        return {
            snapshot,
            status: 'snapshot-only',
            durationMs: Date.now() - start,
        };
    }
    // ── Stage 2: Analyze ──────────────────────────────────────────
    console.log(`[recon] Analyzing site ...`);
    // Scrape docs in parallel with LLM analysis setup
    const docScraper = new doc_scraper_js_1.DocScraper();
    let docs;
    try {
        docs = await docScraper.scrape(url, snapshot.links);
        if (docs.scrapedUrls.length > 0) {
            console.log(`[recon] Scraped ${docs.scrapedUrls.length} doc pages`);
        }
    }
    catch (err) {
        console.log(`[recon] Doc scraping failed (non-fatal): ${err}`);
    }
    const analyzer = new analyzer_js_1.SiteAnalyzer({
        llmEndpoint: options.llmEndpoint,
        llmModel: options.llmModel,
    });
    const analysis = await analyzer.analyze(snapshot, docs);
    console.log(`[recon] Analysis complete: ${analysis.actions.length} actions, ${analysis.states.length} states`);
    if (options.analyzeOnly) {
        return {
            snapshot,
            analysis,
            status: 'analyzed',
            durationMs: Date.now() - start,
        };
    }
    // ── Stage 3: Generate ──────────────────────────────────────────
    const siteName = analysis.name || siteNameFromUrl(url);
    const outputDir = options.outputDir || (0, node_path_1.join)((0, node_os_1.homedir)(), 'projects', 'pingapps', siteName);
    console.log(`[recon] Generating PingApp at ${outputDir} ...`);
    const generator = new generator_js_1.PingAppGenerator();
    if (options.dryRun) {
        const fileMap = generator.preview({
            outputDir,
            siteDefinition: analysis,
            selfTest: false,
            maxRetries: 0,
        });
        console.log(`[recon] Dry run — would generate ${fileMap.size} files:`);
        for (const [path] of fileMap) {
            console.log(`  ${path}`);
        }
        return {
            snapshot,
            analysis,
            generation: {
                outputDir,
                generatedFiles: Array.from(fileMap.keys()),
                compiles: false,
                buildErrors: [],
                fixAttempts: 0,
            },
            status: 'analyzed',
            durationMs: Date.now() - start,
        };
    }
    const genResult = await generator.generate({
        outputDir,
        siteDefinition: analysis,
        selfTest: options.selfTest !== false,
        maxRetries: 3,
    });
    // ── Stage 4: Self-test (optional) ─────────────────────────────
    let generation = genResult;
    if (options.selfTest !== false && !options.dryRun) {
        console.log(`[recon] Running self-test ...`);
        const tester = new self_test_js_1.SelfTester();
        const testResult = await tester.test(outputDir, 3);
        generation = {
            ...genResult,
            compiles: testResult.compiles,
            buildErrors: testResult.errors,
            fixAttempts: testResult.attempts,
        };
        if (testResult.compiles) {
            console.log(`[recon] PingApp generated and verified!`);
        }
        else {
            console.log(`[recon] PingApp generated with ${testResult.errors.length} issues`);
        }
    }
    const status = generation.compiles
        ? 'verified'
        : generation.buildErrors.length > 0
            ? 'generated-with-issues'
            : 'generated';
    return {
        snapshot,
        analysis,
        generation,
        status,
        durationMs: Date.now() - start,
    };
}
//# sourceMappingURL=pipeline.js.map