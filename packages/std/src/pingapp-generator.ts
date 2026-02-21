/**
 * PingApp Generator — Auto-generate PingApp definitions from recordings.
 *
 * Takes a recording (sequence of user actions with selectors) and produces:
 * - manifest.json with site metadata
 * - workflows/*.json with the recorded workflow
 * - selectors.json with all captured selectors
 * - A basic test definition
 */

import type { Recording, RecordedAction } from './types.js';
import { callLLM } from './llm.js';
import { getTimeoutForFeature, isLocalMode } from './local-mode.js';
import { getGeneratePrompt } from './local-prompts.js';
import { repairLLMJson } from './json-repair.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedPingApp {
  manifest: PingAppManifest;
  workflow: PingAppWorkflow;
  selectors: Record<string, SelectorEntry>;
  test: PingAppTest;
}

interface PingAppManifest {
  name: string;
  url: string;
  description: string;
  version: string;
  recordedAt: number;
  actionCount: number;
}

interface PingAppWorkflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  op: string;
  selector?: string;
  value?: string;
  description: string;
}

interface SelectorEntry {
  primary: string;
  fallbacks: string[];
  confidence: number;
}

interface PingAppTest {
  name: string;
  steps: Array<{ op: string; selector?: string; value?: string; expect?: string }>;
}

export interface GeneratePingAppViaLLMInput {
  url: string;
  description: string;
  domContext: string;
}

function deriveDomainAppName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const base = host.split('.').filter(Boolean)[0] || 'site';
    const clean = base.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `${clean || 'site'}-app`;
  } catch {
    return 'site-app';
  }
}

function buildFewShotPrompt(input: GeneratePingAppViaLLMInput, expectedName: string): string {
  return `You are generating a production-quality PingApp JSON spec.

Target URL: ${input.url}
Target app name: ${expectedName}
User description: ${input.description}

Rules:
- Use the target domain in app name. REQUIRED name: ${expectedName}
- DO NOT use generic names like site-app, app, website-app, unknown-app.
- selectors must include REAL CSS selectors from the page context.
- actions must be concrete and executable (op + selector/value).
- schemas must include at least one extraction schema with non-empty fields.
- Return JSON only with keys: name,url,description,selectors,actions,schemas

Good example:
{
  "name": "github-app",
  "url": "https://github.com",
  "description": "Search repositories and open repo details",
  "selectors": {
    "search_input": "input[name='q']",
    "repo_cards": "ul.repo-list li",
    "repo_title": "h3 a",
    "repo_description": "p.mb-1",
    "repo_link": "h3 a"
  },
  "actions": [
    { "name": "search", "op": "type", "selector": "input[name='q']", "value": "{{query}}" },
    { "name": "submit_search", "op": "press", "value": "Enter" },
    { "name": "open_first_repo", "op": "click", "selector": "ul.repo-list li h3 a" }
  ],
  "schemas": [
    {
      "name": "search_results",
      "fields": {
        "title": "ul.repo-list li h3 a",
        "description": "ul.repo-list li p.mb-1",
        "url": "ul.repo-list li h3 a[href]"
      }
    }
  ]
}

Now generate for this target.
${input.domContext}`;
}

function isEmptyObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

function isDegenerateAppSpec(app: Record<string, unknown>): boolean {
  const name = String(app.name ?? '').trim().toLowerCase();
  const genericName = !name || ['site-app', 'unknown-app', 'app', 'website-app'].includes(name);

  const selectors = app.selectors;
  const actions = app.actions;

  const selectorsEmpty = !selectors || isEmptyObject(selectors);
  const actionsEmpty = !Array.isArray(actions) || actions.length === 0;

  return genericName || (selectorsEmpty && actionsEmpty);
}

function enforceAppName(app: Record<string, unknown>, expectedName: string): Record<string, unknown> {
  const current = String(app.name ?? '').trim().toLowerCase();
  if (!current || ['site-app', 'unknown-app', 'app', 'website-app'].includes(current)) {
    return { ...app, name: expectedName };
  }
  return app;
}

function normalizeAppSpec(
  raw: Record<string, unknown>,
  input: GeneratePingAppViaLLMInput,
  expectedName: string,
): Record<string, unknown> {
  const app = { ...raw } as Record<string, unknown>;
  app.name = typeof app.name === 'string' && app.name.trim() ? app.name : expectedName;
  app.url = typeof app.url === 'string' && app.url.trim() ? app.url : input.url;
  app.description = typeof app.description === 'string' && app.description.trim() ? app.description : input.description;

  // Recover actions from numeric object keys if model emitted malformed shape.
  if (!Array.isArray(app.actions)) {
    const recoveredActions: Array<Record<string, unknown>> = [];
    for (const [k, v] of Object.entries(app)) {
      if (!/^\d+$/.test(k)) continue;
      if (v && typeof v === 'object') {
        const action = v as Record<string, unknown>;
        if (typeof action.op === 'string') recoveredActions.push(action);
      }
    }
    if (recoveredActions.length > 0) app.actions = recoveredActions;
  }

  // Build selectors map from actions when missing.
  if (!app.selectors || isEmptyObject(app.selectors)) {
    const selectors: Record<string, string> = {};
    const actions = Array.isArray(app.actions) ? app.actions : [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i] as Record<string, unknown>;
      const sel = typeof action.selector === 'string' ? action.selector : '';
      if (!sel) continue;
      const key = typeof action.name === 'string' && action.name.trim()
        ? action.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : `selector_${i + 1}`;
      if (!selectors[key]) selectors[key] = sel;
    }
    app.selectors = selectors;
  }

  // Build a minimal schema from selectors when absent.
  if (!Array.isArray(app.schemas) || app.schemas.length === 0) {
    const selectors = (app.selectors && typeof app.selectors === 'object')
      ? app.selectors as Record<string, unknown>
      : {};
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(selectors)) {
      if (typeof v === 'string' && v.trim()) fields[k] = v;
      if (Object.keys(fields).length >= 5) break;
    }
    if (Object.keys(fields).length > 0) {
      app.schemas = [{ name: 'main', fields }];
    } else {
      app.schemas = [];
    }
  }

  if (!Array.isArray(app.actions)) app.actions = [];
  if (!app.selectors || typeof app.selectors !== 'object') app.selectors = {};

  return app;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class PingAppGenerator {
  /**
   * Generate a PingApp definition from a recording.
   */
  generate(recording: Recording, name?: string): GeneratedPingApp {
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
  serialize(app: GeneratedPingApp): Record<string, string> {
    return {
      'manifest.json': JSON.stringify(app.manifest, null, 2),
      [`workflows/${app.workflow.name}.json`]: JSON.stringify(app.workflow, null, 2),
      'selectors.json': JSON.stringify(app.selectors, null, 2),
      [`tests/test_${app.manifest.name}.json`]: JSON.stringify(app.test, null, 2),
    };
  }

  // ---- internal ----

  private deriveAppName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'unknown-app';
    }
  }

  private collectSelectors(actions: RecordedAction[]): Record<string, SelectorEntry> {
    const selectors: Record<string, SelectorEntry> = {};
    let idx = 0;

    for (const action of actions) {
      const sels = action.selectors;
      const flatSel = action.selector;
      if (!sels?.css && !sels?.ariaLabel && !flatSel) continue;

      const key = this.selectorKey(action, idx);
      idx++;

      const primary = sels?.css ?? flatSel ?? `[aria-label="${sels?.ariaLabel}"]`;
      const fallbacks: string[] = [];

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
      if (primary.startsWith('#') || primary.includes('[id=')) confidence = 0.9;
      else if (primary.includes('data-testid')) confidence = 0.85;
      else if (primary.includes('[aria-label=')) confidence = 0.8;
      else if (primary.includes('[name=')) confidence = 0.75;

      selectors[key] = { primary, fallbacks, confidence };
    }

    return selectors;
  }

  private selectorKey(action: RecordedAction, index: number): string {
    // Try to derive a meaningful key from the selector
    const css = action.selectors?.css ?? action.selector ?? '';
    const idMatch = css.match(/#([a-zA-Z][\w-]*)/);
    if (idMatch) return idMatch[1];

    const labelMatch = action.selectors?.ariaLabel;
    if (labelMatch) {
      return labelMatch.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    }

    return `element_${index}`;
  }

  private buildWorkflow(recording: Recording, appName: string): PingAppWorkflow {
    const steps: WorkflowStep[] = recording.actions.map((action, i) => {
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

  private buildManifest(recording: Recording, appName: string): PingAppManifest {
    return {
      name: appName,
      url: recording.url,
      description: `Auto-generated PingApp from recording on ${recording.url}`,
      version: '1.0.0',
      recordedAt: recording.startedAt,
      actionCount: recording.actions.length,
    };
  }

  private buildTest(recording: Recording, appName: string): PingAppTest {
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

export async function generatePingAppViaLLM(input: GeneratePingAppViaLLMInput): Promise<Record<string, unknown>> {
  const local = isLocalMode();
  const promptDef = getGeneratePrompt(local);
  const expectedName = deriveDomainAppName(input.url);
  const basePrompt = promptDef.userTemplate
    .replace('{{url}}', input.url)
    .replace('{{description}}', input.description)
    .replace('{{domContext}}', input.domContext);
  const prompt = local
    ? `${basePrompt}

${buildFewShotPrompt(input, expectedName)}`
    : basePrompt;

  const raw = await callLLM(prompt, {
    feature: 'generate',
    systemPrompt: promptDef.system,
    timeoutMs: getTimeoutForFeature('generate'),
    responseFormatJson: true,
    maxTokens: local ? 6144 : 1400,
    temperature: 0.1,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = repairLLMJson(raw) as Record<string, unknown>;
  } catch {
    const fixerPrompt = `Fix this into valid JSON with keys {name,url,description,selectors,actions,schemas}.
Invalid:
${raw}
RESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences.`;
    const fixedRaw = await callLLM(fixerPrompt, {
      feature: 'generate',
      timeoutMs: getTimeoutForFeature('generate'),
      responseFormatJson: true,
      maxTokens: local ? 6144 : 1400,
      temperature: 0,
      systemPrompt: 'Return valid JSON only. RESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences.',
    });
    parsed = repairLLMJson(fixedRaw) as Record<string, unknown>;
  }

  parsed = normalizeAppSpec(enforceAppName(parsed, expectedName), input, expectedName);

  if (local && isDegenerateAppSpec(parsed)) {
    const retryPrompt = `${buildFewShotPrompt(input, expectedName)}

Your previous output was too generic or empty. Retry now with concrete selectors/actions/schemas from the DOM context. Output JSON only.`;
    const retryRaw = await callLLM(retryPrompt, {
      feature: 'generate',
      systemPrompt: promptDef.system,
      timeoutMs: getTimeoutForFeature('generate'),
      responseFormatJson: true,
      maxTokens: 6144,
      temperature: 0,
    });

    try {
      const retried = repairLLMJson(retryRaw) as Record<string, unknown>;
      parsed = normalizeAppSpec(enforceAppName(retried, expectedName), input, expectedName);
    } catch {
      // Keep initial parsed output if retry parse fails.
    }
  }

  return normalizeAppSpec(parsed, input, expectedName);
}
