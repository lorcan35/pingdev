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
