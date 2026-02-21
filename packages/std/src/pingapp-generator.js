/**
 * PingApp Generator — Auto-generate PingApp definitions from recordings.
 *
 * Takes a recording (sequence of user actions with selectors) and produces:
 * - manifest.json with site metadata
 * - workflows/*.json with the recorded workflow
 * - selectors.json with all captured selectors
 * - A basic test definition
 */
import { callLLM } from './llm.js';
import { getTimeoutForFeature, isLocalMode } from './local-mode.js';
import { getGeneratePrompt } from './local-prompts.js';
import { repairLLMJson } from './json-repair.js';
// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export class PingAppGenerator {
    /**
     * Generate a PingApp definition from a recording.
     */
    generate(recording, name) {
        const appName = name ?? this.deriveAppName(recording.url);
        const selectors = this.collectSelectors(recording.actions);
        const workflow = this.buildWorkflow(recording, appName);
        const manifest = this.buildManifest(recording, appName);
        const test = this.buildTest(recording, appName);
        return { manifest, workflow, selectors, test };
    }
    /**
     * Serialize a generated PingApp to a flat file map (path → content).
     */
    serialize(app) {
        return {
            'manifest.json': JSON.stringify(app.manifest, null, 2),
            [`workflows/${app.workflow.name}.json`]: JSON.stringify(app.workflow, null, 2),
            'selectors.json': JSON.stringify(app.selectors, null, 2),
            [`tests/test_${app.manifest.name}.json`]: JSON.stringify(app.test, null, 2),
        };
    }
    // ---- internal ----
    deriveAppName(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname.replace(/^www\./, '').split('.')[0];
        }
        catch {
            return 'unknown-app';
        }
    }
    collectSelectors(actions) {
        const selectors = {};
        let idx = 0;
        for (const action of actions) {
            const sels = action.selectors;
            const flatSel = action.selector;
            if (!sels?.css && !sels?.ariaLabel && !flatSel)
                continue;
            const key = this.selectorKey(action, idx);
            idx++;
            const primary = sels?.css ?? flatSel ?? `[aria-label="${sels?.ariaLabel}"]`;
            const fallbacks = [];
            if (sels?.css && sels?.ariaLabel) {
                fallbacks.push(`[aria-label="${sels.ariaLabel}"]`);
            }
            if (sels?.textContent) {
                fallbacks.push(`:has-text("${sels.textContent}")`);
            }
            if (sels?.nthChild) {
                fallbacks.push(sels.nthChild);
            }
            // Higher confidence for IDs and aria-labels
            let confidence = 0.5;
            if (primary.startsWith('#') || primary.includes('[id='))
                confidence = 0.9;
            else if (primary.includes('data-testid'))
                confidence = 0.85;
            else if (primary.includes('[aria-label='))
                confidence = 0.8;
            else if (primary.includes('[name='))
                confidence = 0.75;
            selectors[key] = { primary, fallbacks, confidence };
        }
        return selectors;
    }
    selectorKey(action, index) {
        // Try to derive a meaningful key from the selector
        const css = action.selectors?.css ?? action.selector ?? '';
        const idMatch = css.match(/#([a-zA-Z][\w-]*)/);
        if (idMatch)
            return idMatch[1];
        const labelMatch = action.selectors?.ariaLabel;
        if (labelMatch) {
            return labelMatch.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
        }
        return `element_${index}`;
    }
    buildWorkflow(recording, appName) {
        const steps = recording.actions.map((action, i) => {
            const sel = action.selectors?.css ?? action.selector;
            const label = action.selectors?.ariaLabel;
            switch (action.type) {
                case 'click':
                    return {
                        op: 'click',
                        selector: sel,
                        description: `Click ${label || sel || `element #${i}`}`,
                    };
                case 'input':
                case 'type':
                    return {
                        op: 'type',
                        selector: sel,
                        value: action.value,
                        description: `Type "${(action.value ?? '').slice(0, 50)}" into ${sel || `element #${i}`}`,
                    };
                case 'submit':
                    return {
                        op: 'click',
                        selector: sel,
                        description: `Submit form via ${sel || 'Enter key'}`,
                    };
                case 'keydown':
                case 'press':
                    return {
                        op: 'press',
                        value: action.value,
                        description: `Press key: ${action.value}`,
                    };
                case 'navigate':
                    return {
                        op: 'navigate',
                        value: action.value,
                        description: `Navigate to ${action.value}`,
                    };
                case 'scroll':
                    return {
                        op: 'scroll',
                        description: 'Scroll page',
                    };
                case 'act':
                    return {
                        op: 'act',
                        value: action.value,
                        description: `Execute: ${(action.value ?? '').slice(0, 80)}`,
                    };
                default:
                    return {
                        op: action.type,
                        selector: sel,
                        description: `${action.type} on ${sel || `element #${i}`}`,
                    };
            }
        });
        return {
            name: appName,
            description: `Recorded workflow on ${recording.url}`,
            steps,
        };
    }
    buildManifest(recording, appName) {
        return {
            name: appName,
            url: recording.url,
            description: `Auto-generated PingApp from recording on ${recording.url}`,
            version: '1.0.0',
            recordedAt: recording.startedAt,
            actionCount: recording.actions.length,
        };
    }
    buildTest(recording, appName) {
        // Build a basic smoke test that replays the recording
        const steps = recording.actions
            .filter((a) => a.type === 'click' || a.type === 'input' || a.type === 'type')
            .slice(0, 5) // limit to first 5 actions
            .map((action) => {
            const sel = action.selectors?.css ?? action.selector;
            if (action.type === 'click') {
                return {
                    op: 'click',
                    selector: sel,
                };
            }
            return {
                op: 'type',
                selector: sel,
                value: action.value,
            };
        });
        return {
            name: `test_${appName}`,
            steps,
        };
    }
}
export async function generatePingAppViaLLM(input) {
    const local = isLocalMode();
    const promptDef = getGeneratePrompt(local);
    const prompt = promptDef.userTemplate
        .replace('{{url}}', input.url)
        .replace('{{description}}', input.description)
        .replace('{{domContext}}', input.domContext);
    const raw = await callLLM(prompt, {
        feature: 'generate',
        systemPrompt: promptDef.system,
        timeoutMs: getTimeoutForFeature('generate'),
        responseFormatJson: true,
        maxTokens: local ? 4096 : 1400,
        temperature: 0.1,
    });
    try {
        return repairLLMJson(raw);
    }
    catch {
        const fixerPrompt = `Fix this into valid JSON with keys {name,url,description,selectors,actions,schemas}.\nInvalid:\n${raw}\nRESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences.`;
        const fixedRaw = await callLLM(fixerPrompt, {
            feature: 'generate',
            timeoutMs: getTimeoutForFeature('generate'),
            responseFormatJson: true,
            maxTokens: local ? 4096 : 1400,
            temperature: 0,
            systemPrompt: 'Return valid JSON only. RESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences.',
        });
        return repairLLMJson(fixedRaw);
    }
}
//# sourceMappingURL=pingapp-generator.js.map