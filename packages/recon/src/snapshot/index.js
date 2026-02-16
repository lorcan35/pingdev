"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureScreenshots = exports.captureAriaTree = exports.detectDynamicAreas = exports.discoverRegions = exports.discoverElements = exports.SnapshotEngine = void 0;
/**
 * Site snapshot engine — barrel exports.
 */
var engine_js_1 = require("./engine.js");
Object.defineProperty(exports, "SnapshotEngine", { enumerable: true, get: function () { return engine_js_1.SnapshotEngine; } });
var elements_js_1 = require("./elements.js");
Object.defineProperty(exports, "discoverElements", { enumerable: true, get: function () { return elements_js_1.discoverElements; } });
var regions_js_1 = require("./regions.js");
Object.defineProperty(exports, "discoverRegions", { enumerable: true, get: function () { return regions_js_1.discoverRegions; } });
var dynamic_js_1 = require("./dynamic.js");
Object.defineProperty(exports, "detectDynamicAreas", { enumerable: true, get: function () { return dynamic_js_1.detectDynamicAreas; } });
var aria_js_1 = require("./aria.js");
Object.defineProperty(exports, "captureAriaTree", { enumerable: true, get: function () { return aria_js_1.captureAriaTree; } });
var screenshots_js_1 = require("./screenshots.js");
Object.defineProperty(exports, "captureScreenshots", { enumerable: true, get: function () { return screenshots_js_1.captureScreenshots; } });
//# sourceMappingURL=index.js.map