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
      if (!action.selectors.css && !action.selectors.ariaLabel) continue;

      const key = this.selectorKey(action, idx);
      idx++;

      const primary = action.selectors.css ?? `[aria-label="${action.selectors.ariaLabel}"]`;
      const fallbacks: string[] = [];

      if (action.selectors.css && action.selectors.ariaLabel) {
        fallbacks.push(`[aria-label="${action.selectors.ariaLabel}"]`);
      }
      if (action.selectors.textContent) {
        fallbacks.push(`:has-text("${action.selectors.textContent}")`);
      }
      if (action.selectors.nthChild) {
        fallbacks.push(action.selectors.nthChild);
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
    const css = action.selectors.css ?? '';
    const idMatch = css.match(/#([a-zA-Z][\w-]*)/);
    if (idMatch) return idMatch[1];

    const labelMatch = action.selectors.ariaLabel;
    if (labelMatch) {
      return labelMatch.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    }

    return `element_${index}`;
  }

  private buildWorkflow(recording: Recording, appName: string): PingAppWorkflow {
    const steps: WorkflowStep[] = recording.actions.map((action, i) => {
      switch (action.type) {
        case 'click':
          return {
            op: 'click',
            selector: action.selectors.css,
            description: `Click ${action.selectors.ariaLabel || action.selectors.css || `element #${i}`}`,
          };
        case 'input':
          return {
            op: 'type',
            selector: action.selectors.css,
            value: action.value,
            description: `Type "${(action.value ?? '').slice(0, 50)}" into ${action.selectors.css || `element #${i}`}`,
          };
        case 'submit':
          return {
            op: 'click',
            selector: action.selectors.css,
            description: `Submit form via ${action.selectors.css || 'Enter key'}`,
          };
        case 'keydown':
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
        default:
          return {
            op: action.type,
            selector: action.selectors.css,
            description: `${action.type} on ${action.selectors.css || `element #${i}`}`,
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
      .filter((a) => a.type === 'click' || a.type === 'input')
      .slice(0, 5) // limit to first 5 actions
      .map((action) => {
        if (action.type === 'click') {
          return {
            op: 'click',
            selector: action.selectors.css,
          };
        }
        return {
          op: 'type',
          selector: action.selectors.css,
          value: action.value,
        };
      });

    return {
      name: `test_${appName}`,
      steps,
    };
  }
}
