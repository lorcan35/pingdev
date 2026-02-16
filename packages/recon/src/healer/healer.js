"use strict";
/** Healer — auto-fix broken selectors using LLM + live ARIA snapshots. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Healer = void 0;
const playwright_1 = require("playwright");
const core_1 = require("@pingdev/core");
const llm_client_js_1 = require("../analyzer/llm-client.js");
const aria_js_1 = require("../snapshot/aria.js");
const prompts_js_1 = require("./prompts.js");
const patcher_js_1 = require("./patcher.js");
const log = (0, core_1.createLogger)('healer');
/** Serialize an ARIA tree to a readable text format for LLM consumption. */
function ariaTreeToText(nodes, indent = 0) {
    const pad = '  '.repeat(indent);
    return nodes
        .map((node) => {
        let line = `${pad}[${node.role}]`;
        if (node.name)
            line += ` "${node.name}"`;
        if (node.value)
            line += ` value="${node.value}"`;
        if (node.description)
            line += ` desc="${node.description}"`;
        if (node.disabled)
            line += ' (disabled)';
        if (node.checked !== undefined)
            line += ` checked=${node.checked}`;
        if (node.expanded !== undefined)
            line += ` expanded=${node.expanded}`;
        if (node.level !== undefined)
            line += ` level=${node.level}`;
        const childText = node.children
            ? '\n' + ariaTreeToText(node.children, indent + 1)
            : '';
        return line + childText;
    })
        .join('\n');
}
class Healer {
    appDir;
    cdpUrl;
    maxRetries;
    llm;
    constructor(appDir, options) {
        this.appDir = appDir;
        this.cdpUrl = options?.cdpUrl ?? 'http://127.0.0.1:18800';
        this.maxRetries = options?.maxRetries ?? 3;
        this.llm = new llm_client_js_1.LLMClient({
            endpoint: options?.llmEndpoint,
            model: options?.llmModel,
        });
    }
    /**
     * Heal failed actions by capturing ARIA snapshots, asking the LLM
     * for corrected selectors, patching the file, and validating.
     */
    async heal(failedActions) {
        const start = Date.now();
        const reports = [];
        // Connect to the browser via CDP
        const browser = await playwright_1.chromium.connectOverCDP(this.cdpUrl);
        try {
            const contexts = browser.contexts();
            if (contexts.length === 0) {
                throw new Error('No browser contexts found');
            }
            const pages = contexts[0].pages();
            if (pages.length === 0) {
                throw new Error('No pages found in browser context');
            }
            const page = pages[0];
            for (const action of failedActions) {
                const report = await this.healAction(page, action);
                reports.push(report);
            }
        }
        finally {
            await browser.close().catch(() => { });
        }
        const totalFixed = reports.filter((r) => r.fixed).length;
        const totalFailed = reports.filter((r) => !r.fixed).length;
        return {
            appDir: this.appDir,
            reports,
            totalFixed,
            totalFailed,
            duration_ms: Date.now() - start,
        };
    }
    /** Attempt to heal a single failed action with retries. */
    async healAction(page, action) {
        const attempts = [];
        let fixed = false;
        let finalPatches = [];
        for (let i = 1; i <= this.maxRetries; i++) {
            const attempt = await this.attemptHeal(page, action, i);
            attempts.push(attempt);
            if (attempt.validationPassed) {
                fixed = true;
                finalPatches = attempt.patches;
                break;
            }
            log.warn({ actionName: action.actionName, attempt: i, error: attempt.error }, 'Healing attempt failed, retrying...');
        }
        return {
            actionName: action.actionName,
            attempts,
            fixed,
            finalPatches,
        };
    }
    /** Single healing attempt: snapshot → LLM → patch → validate. */
    async attemptHeal(page, action, attemptNumber) {
        try {
            // 1. Capture current ARIA tree
            const ariaTree = await (0, aria_js_1.captureAriaTree)(page);
            const ariaText = ariaTreeToText(ariaTree);
            // 2. Read current selectors
            const currentSelectors = (0, patcher_js_1.readSelectorsFile)(this.appDir);
            const selectorDef = currentSelectors[action.selectorName];
            const oldTiers = selectorDef?.tiers ?? [];
            // 3. Build prompt and ask LLM
            const prompt = (0, prompts_js_1.buildHealingPrompt)(action.actionName, action.error, { [action.selectorName]: oldTiers }, ariaText, page.url());
            log.info({ actionName: action.actionName, attempt: attemptNumber }, 'Sending healing request to LLM');
            const response = await this.llm.chatJSON(prompt);
            // 4. Extract patches from LLM response
            const patches = [];
            for (const [name, value] of Object.entries(response.selectors)) {
                const existing = currentSelectors[name];
                patches.push({
                    selectorName: name,
                    oldTiers: existing?.tiers ?? [],
                    newTiers: value.tiers,
                    reason: response.reasoning,
                });
            }
            if (patches.length === 0) {
                return {
                    attemptNumber,
                    patches: [],
                    validationPassed: false,
                    error: 'LLM returned no selector patches',
                };
            }
            // 5. Apply patches to disk
            const updatedSelectors = (0, patcher_js_1.applyPatches)(this.appDir, patches);
            // 6. Validate: try to resolve the healed selector on the live page
            const healedDef = updatedSelectors[action.selectorName];
            if (!healedDef) {
                return {
                    attemptNumber,
                    patches,
                    validationPassed: false,
                    error: `Selector "${action.selectorName}" not found after patching`,
                };
            }
            const locator = await (0, core_1.resolveSelector)(page, healedDef, 5000);
            const validationPassed = locator !== null;
            if (validationPassed) {
                log.info({ actionName: action.actionName, attempt: attemptNumber }, 'Healing succeeded — selector resolved');
            }
            return {
                attemptNumber,
                patches,
                validationPassed,
                error: validationPassed ? undefined : 'Healed selector did not resolve on page',
            };
        }
        catch (err) {
            return {
                attemptNumber,
                patches: [],
                validationPassed: false,
                error: `Healing error: ${err.message}`,
            };
        }
    }
}
exports.Healer = Healer;
//# sourceMappingURL=healer.js.map