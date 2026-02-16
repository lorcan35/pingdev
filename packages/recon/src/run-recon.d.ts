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
export {};
//# sourceMappingURL=run-recon.d.ts.map