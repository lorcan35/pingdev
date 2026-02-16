"use strict";
/**
 * @pingdev/recon — Reconnaissance engine for PingDev.
 *
 * Analyzes any website and generates a complete PingApp config.
 * Pipeline: snapshot → analyze → generate
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPatches = exports.writeSelectorsFile = exports.readSelectorsFile = exports.buildHealingPrompt = exports.Healer = exports.SelfTester = exports.PingAppGenerator = exports.buildAnalysisPrompt = exports.DocScraper = exports.LLMClient = exports.SiteAnalyzer = exports.captureScreenshots = exports.captureAriaTree = exports.detectDynamicAreas = exports.discoverRegions = exports.discoverElements = exports.SnapshotEngine = exports.runRecon = void 0;
// ─── Pipeline ─────────────────────────────────────────────────────
var pipeline_js_1 = require("./pipeline.js");
Object.defineProperty(exports, "runRecon", { enumerable: true, get: function () { return pipeline_js_1.runRecon; } });
// ─── Snapshot Engine ──────────────────────────────────────────────
var index_js_1 = require("./snapshot/index.js");
Object.defineProperty(exports, "SnapshotEngine", { enumerable: true, get: function () { return index_js_1.SnapshotEngine; } });
var elements_js_1 = require("./snapshot/elements.js");
Object.defineProperty(exports, "discoverElements", { enumerable: true, get: function () { return elements_js_1.discoverElements; } });
var regions_js_1 = require("./snapshot/regions.js");
Object.defineProperty(exports, "discoverRegions", { enumerable: true, get: function () { return regions_js_1.discoverRegions; } });
var dynamic_js_1 = require("./snapshot/dynamic.js");
Object.defineProperty(exports, "detectDynamicAreas", { enumerable: true, get: function () { return dynamic_js_1.detectDynamicAreas; } });
var aria_js_1 = require("./snapshot/aria.js");
Object.defineProperty(exports, "captureAriaTree", { enumerable: true, get: function () { return aria_js_1.captureAriaTree; } });
var screenshots_js_1 = require("./snapshot/screenshots.js");
Object.defineProperty(exports, "captureScreenshots", { enumerable: true, get: function () { return screenshots_js_1.captureScreenshots; } });
// ─── Analyzer ─────────────────────────────────────────────────────
var analyzer_js_1 = require("./analyzer/analyzer.js");
Object.defineProperty(exports, "SiteAnalyzer", { enumerable: true, get: function () { return analyzer_js_1.SiteAnalyzer; } });
var llm_client_js_1 = require("./analyzer/llm-client.js");
Object.defineProperty(exports, "LLMClient", { enumerable: true, get: function () { return llm_client_js_1.LLMClient; } });
var doc_scraper_js_1 = require("./analyzer/doc-scraper.js");
Object.defineProperty(exports, "DocScraper", { enumerable: true, get: function () { return doc_scraper_js_1.DocScraper; } });
var prompts_js_1 = require("./analyzer/prompts.js");
Object.defineProperty(exports, "buildAnalysisPrompt", { enumerable: true, get: function () { return prompts_js_1.buildAnalysisPrompt; } });
// ─── Generator ────────────────────────────────────────────────────
var generator_js_1 = require("./generator/generator.js");
Object.defineProperty(exports, "PingAppGenerator", { enumerable: true, get: function () { return generator_js_1.PingAppGenerator; } });
var self_test_js_1 = require("./generator/self-test.js");
Object.defineProperty(exports, "SelfTester", { enumerable: true, get: function () { return self_test_js_1.SelfTester; } });
// ─── Healer ──────────────────────────────────────────────────────
var index_js_2 = require("./healer/index.js");
Object.defineProperty(exports, "Healer", { enumerable: true, get: function () { return index_js_2.Healer; } });
Object.defineProperty(exports, "buildHealingPrompt", { enumerable: true, get: function () { return index_js_2.buildHealingPrompt; } });
Object.defineProperty(exports, "readSelectorsFile", { enumerable: true, get: function () { return index_js_2.readSelectorsFile; } });
Object.defineProperty(exports, "writeSelectorsFile", { enumerable: true, get: function () { return index_js_2.writeSelectorsFile; } });
Object.defineProperty(exports, "applyPatches", { enumerable: true, get: function () { return index_js_2.applyPatches; } });
//# sourceMappingURL=index.js.map