"use strict";
/** Healer module — auto-fix broken selectors using LLM + ARIA snapshots. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPatches = exports.writeSelectorsFile = exports.readSelectorsFile = exports.buildHealingPrompt = exports.Healer = void 0;
var healer_js_1 = require("./healer.js");
Object.defineProperty(exports, "Healer", { enumerable: true, get: function () { return healer_js_1.Healer; } });
var prompts_js_1 = require("./prompts.js");
Object.defineProperty(exports, "buildHealingPrompt", { enumerable: true, get: function () { return prompts_js_1.buildHealingPrompt; } });
var patcher_js_1 = require("./patcher.js");
Object.defineProperty(exports, "readSelectorsFile", { enumerable: true, get: function () { return patcher_js_1.readSelectorsFile; } });
Object.defineProperty(exports, "writeSelectorsFile", { enumerable: true, get: function () { return patcher_js_1.writeSelectorsFile; } });
Object.defineProperty(exports, "applyPatches", { enumerable: true, get: function () { return patcher_js_1.applyPatches; } });
//# sourceMappingURL=index.js.map