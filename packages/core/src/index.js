"use strict";
/** @pingdev/core — Framework for building PingApps (local API shims for websites). */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestCaseGenerator = exports.RuntimeHealer = exports.HealingLog = exports.SelectorRegistry = exports.scoring = exports.ActionValidator = exports.PingAppLoader = exports.jobStateStore = exports.createLogger = exports.createError = exports.Errors = exports.withRetry = exports.ConversationStore = exports.IdempotencyStore = exports.RateLimiter = exports.ArtifactLogger = exports.UIStateMachine = exports.resolveSelectorOrThrow = exports.resolveSelector = exports.BrowserAdapter = exports.defineSite = exports.createShimApp = void 0;
// Main API
var app_js_1 = require("./app.js");
Object.defineProperty(exports, "createShimApp", { enumerable: true, get: function () { return app_js_1.createShimApp; } });
var site_js_1 = require("./site.js");
Object.defineProperty(exports, "defineSite", { enumerable: true, get: function () { return site_js_1.defineSite; } });
// Individual modules for advanced usage
var adapter_js_1 = require("./browser/adapter.js");
Object.defineProperty(exports, "BrowserAdapter", { enumerable: true, get: function () { return adapter_js_1.BrowserAdapter; } });
var selector_resolver_js_1 = require("./browser/selector-resolver.js");
Object.defineProperty(exports, "resolveSelector", { enumerable: true, get: function () { return selector_resolver_js_1.resolveSelector; } });
Object.defineProperty(exports, "resolveSelectorOrThrow", { enumerable: true, get: function () { return selector_resolver_js_1.resolveSelectorOrThrow; } });
var index_js_1 = require("./state-machine/index.js");
Object.defineProperty(exports, "UIStateMachine", { enumerable: true, get: function () { return index_js_1.UIStateMachine; } });
var index_js_2 = require("./artifacts/index.js");
Object.defineProperty(exports, "ArtifactLogger", { enumerable: true, get: function () { return index_js_2.ArtifactLogger; } });
var rate_limiter_js_1 = require("./api/rate-limiter.js");
Object.defineProperty(exports, "RateLimiter", { enumerable: true, get: function () { return rate_limiter_js_1.RateLimiter; } });
var idempotency_js_1 = require("./api/idempotency.js");
Object.defineProperty(exports, "IdempotencyStore", { enumerable: true, get: function () { return idempotency_js_1.IdempotencyStore; } });
var conversation_store_js_1 = require("./worker/conversation-store.js");
Object.defineProperty(exports, "ConversationStore", { enumerable: true, get: function () { return conversation_store_js_1.ConversationStore; } });
var retry_js_1 = require("./worker/retry.js");
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return retry_js_1.withRetry; } });
var index_js_3 = require("./errors/index.js");
Object.defineProperty(exports, "Errors", { enumerable: true, get: function () { return index_js_3.Errors; } });
Object.defineProperty(exports, "createError", { enumerable: true, get: function () { return index_js_3.createError; } });
var logger_js_1 = require("./logger.js");
Object.defineProperty(exports, "createLogger", { enumerable: true, get: function () { return logger_js_1.createLogger; } });
exports.jobStateStore = __importStar(require("./worker/job-state-store.js"));
// Validator module
var index_js_4 = require("./validator/index.js");
Object.defineProperty(exports, "PingAppLoader", { enumerable: true, get: function () { return index_js_4.PingAppLoader; } });
Object.defineProperty(exports, "ActionValidator", { enumerable: true, get: function () { return index_js_4.ActionValidator; } });
// Scoring module
exports.scoring = __importStar(require("./scoring/index.js"));
// Runtime self-healing
var index_js_5 = require("./runtime/index.js");
Object.defineProperty(exports, "SelectorRegistry", { enumerable: true, get: function () { return index_js_5.SelectorRegistry; } });
Object.defineProperty(exports, "HealingLog", { enumerable: true, get: function () { return index_js_5.HealingLog; } });
Object.defineProperty(exports, "RuntimeHealer", { enumerable: true, get: function () { return index_js_5.RuntimeHealer; } });
Object.defineProperty(exports, "TestCaseGenerator", { enumerable: true, get: function () { return index_js_5.TestCaseGenerator; } });
//# sourceMappingURL=index.js.map