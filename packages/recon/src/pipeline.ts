/**
 * Recon Pipeline — orchestrates snapshot → analyzer → generator.
 *
 * `pingdev recon <url>` runs through all three stages and outputs a PingApp.
 */

import { SnapshotEngine } from './snapshot/index.js';
import { SiteAnalyzer } from './analyzer/analyzer.js';
import { DocScraper } from './analyzer/doc-scraper.js';
import { PingAppGenerator } from './generator/generator.js';
import { SelfTester } from './generator/self-test.js';
import type {
  ReconOptions,
  ReconResult,
  SiteSnapshot,
  SiteDefinitionResult,
  DocScrapeResult,
  GeneratorResult,
} from './types.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Derive a safe directory name from a URL. */
function siteNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname
      .replace(/^www\./, '')
      .replace(/\./g, '-')
      .replace(/[^a-z0-9-]/gi, '');
  } catch {
    return 'unknown-site';
  }
}

/** Run the full recon pipeline. */
export async function runRecon(options: ReconOptions): Promise<ReconResult> {
  const start = Date.now();
  const { url } = options;

  // ── Stage 1: Snapshot ──────────────────────────────────────────
  console.log(`\n[recon] Snapshotting ${url} ...`);
  const snapshotEngine = new SnapshotEngine({
    screenshots: true,
    captureAriaTree: true,
  });

  let snapshot: SiteSnapshot;
  try {
    snapshot = await snapshotEngine.snapshot(url);
    console.log(
      `[recon] Snapshot complete: ${snapshot.elements.length} elements, ${snapshot.regions.length} regions`,
    );
  } finally {
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
  const docScraper = new DocScraper();
  let docs: DocScrapeResult | undefined;
  try {
    docs = await docScraper.scrape(url, snapshot.links);
    if (docs.scrapedUrls.length > 0) {
      console.log(`[recon] Scraped ${docs.scrapedUrls.length} doc pages`);
    }
  } catch (err) {
    console.log(`[recon] Doc scraping failed (non-fatal): ${err}`);
  }

  const analyzer = new SiteAnalyzer({
    llmEndpoint: options.llmEndpoint,
    llmModel: options.llmModel,
  });

  const analysis = await analyzer.analyze(snapshot, docs);
  console.log(
    `[recon] Analysis complete: ${analysis.actions.length} actions, ${analysis.states.length} states`,
  );

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
  const outputDir =
    options.outputDir || join(homedir(), 'projects', 'pingapps', siteName);

  console.log(`[recon] Generating PingApp at ${outputDir} ...`);

  const generator = new PingAppGenerator();

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
  let generation: GeneratorResult = genResult;

  if (options.selfTest !== false && !options.dryRun) {
    console.log(`[recon] Running self-test ...`);
    const tester = new SelfTester();
    const testResult = await tester.test(outputDir, 3);
    generation = {
      ...genResult,
      compiles: testResult.compiles,
      buildErrors: testResult.errors,
      fixAttempts: testResult.attempts,
    };

    if (testResult.compiles) {
      console.log(`[recon] PingApp generated and verified!`);
    } else {
      console.log(
        `[recon] PingApp generated with ${testResult.errors.length} issues`,
      );
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
