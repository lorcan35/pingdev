"use strict";
/** Generate health reports for PingApp selector quality. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHealthReport = generateHealthReport;
const selector_scorer_js_1 = require("./selector-scorer.js");
const action_scorer_js_1 = require("./action-scorer.js");
/** Generate a full health report for a PingApp. */
function generateHealthReport(appName, url, selectors, validationReport) {
    const warnings = [];
    const recommendations = [];
    // Score each selector as an "action" (one selector def per action)
    const selectorEntries = Object.entries(selectors);
    const actionScores = selectorEntries.map(([key, selectorDef]) => {
        const validationResult = validationReport?.results.find(r => r.actionName === key);
        const action = (0, action_scorer_js_1.scoreAction)(key, [selectorDef], validationResult);
        // Analyze selector scores for warnings and recommendations
        const scores = (0, selector_scorer_js_1.scoreSelectorDef)(selectorDef);
        for (const score of scores) {
            // Warn on low-confidence selectors
            if (score.confidence < 0.5) {
                warnings.push(`Selector '${key}' tier '${score.name}' has low confidence (${score.confidence.toFixed(2)}): ${score.reason}`);
            }
            // Warn on auto-generated/dynamic IDs
            if (score.reason.includes('auto-generated') || score.reason.includes('Auto-generated')) {
                warnings.push(`Selector '${key}' uses auto-generated ID — will break on next deploy`);
            }
        }
        // Warn if only one tier
        if (selectorDef.tiers.length === 1) {
            warnings.push(`Selector '${key}' has only one tier — no fallback available`);
        }
        // Generate recommendations based on tier types
        const hasCssClass = scores.some(s => s.tier === 'css-class');
        const hasAria = scores.some(s => s.tier === 'aria');
        const hasTestId = scores.some(s => s.tier === 'data-testid');
        const hasXpath = scores.some(s => s.tier === 'xpath');
        if (hasCssClass && !hasAria) {
            recommendations.push(`Replace CSS class selector '${key}' with ARIA label for stability`);
        }
        if (!hasTestId && scores.every(s => s.confidence < 0.85)) {
            recommendations.push(`Add data-testid fallback for selector '${key}'`);
        }
        if (hasXpath && !hasAria && !hasTestId) {
            recommendations.push(`Selector '${key}' relies on XPath — add ARIA or data-testid tier`);
        }
        const dynamicScore = scores.find(s => s.reason.includes('auto-generated') || s.reason.includes('Auto-generated'));
        if (dynamicScore) {
            recommendations.push(`Selector '${key}' uses auto-generated ID — will break on next deploy`);
        }
        return action;
    });
    // Overall score: average of action overallScores × 100
    const overallScore = actionScores.length > 0
        ? Math.round((actionScores.reduce((sum, a) => sum + a.overallScore, 0) / actionScores.length) * 100)
        : 0;
    // Deduplicate warnings and recommendations
    const uniqueWarnings = [...new Set(warnings)];
    const uniqueRecommendations = [...new Set(recommendations)];
    return {
        appName,
        url,
        timestamp: new Date().toISOString(),
        actionScores,
        overallScore,
        warnings: uniqueWarnings,
        recommendations: uniqueRecommendations,
    };
}
//# sourceMappingURL=health-reporter.js.map