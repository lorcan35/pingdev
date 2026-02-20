/**
 * Cross-Tab Data Pipes — Pipeline Engine
 *
 * Unix pipe-style data flow between browser tabs. Supports:
 * - Sequential and parallel step execution
 * - Variable interpolation between steps ({{variable}} syntax)
 * - Transform steps (string templates, no tab needed)
 * - Error handling per step: skip, abort, retry
 *
 * Pipeline format:
 *   { name, steps: [{ id, tab?, op, schema?, template?, input?, output?, onError? }], parallel?: string[] }
 *
 * Pipe shorthand: "extract:amazon:.price | transform:'Deal: {{value}}' | type:slack:#msg"
 */

import type { PipelineDef, PipelineStep, PipelineResult } from './types.js';
import type { ExtensionBridge } from './ext-bridge.js';
import { resolveTemplate } from './workflow-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepOutcome {
  id: string;
  status: 'ok' | 'error' | 'skipped';
  result?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pipeline Engine
// ---------------------------------------------------------------------------

export class PipelineEngine {
  private extBridge: ExtensionBridge;

  constructor(extBridge: ExtensionBridge) {
    this.extBridge = extBridge;
  }

  /**
   * Validate a pipeline definition. Returns a list of errors (empty = valid).
   */
  validate(pipeline: PipelineDef): string[] {
    const errors: string[] = [];
    if (!pipeline.name) errors.push('Pipeline name is required');
    if (!Array.isArray(pipeline.steps) || pipeline.steps.length === 0) {
      errors.push('Pipeline must have at least one step');
      return errors;
    }

    const stepIds = new Set<string>();
    for (const step of pipeline.steps) {
      if (!step.id) {
        errors.push('Every step must have an "id"');
        continue;
      }
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step id: "${step.id}"`);
      }
      stepIds.add(step.id);

      if (!step.op) {
        errors.push(`Step "${step.id}": missing "op"`);
      }

      // Tab-based ops require a tab
      if (['extract', 'click', 'type', 'read', 'navigate'].includes(step.op) && !step.tab) {
        errors.push(`Step "${step.id}": op "${step.op}" requires a "tab" field`);
      }

      // Transform requires template
      if (step.op === 'transform' && !step.template) {
        errors.push(`Step "${step.id}": transform op requires a "template" field`);
      }
    }

    // Validate parallel references
    if (pipeline.parallel) {
      for (const id of pipeline.parallel) {
        if (!stepIds.has(id)) {
          errors.push(`Parallel step "${id}" not found in steps`);
        }
      }
    }

    return errors;
  }

  /**
   * Execute a pipeline definition. Returns detailed results.
   */
  async run(pipeline: PipelineDef): Promise<PipelineResult> {
    const startTime = Date.now();
    const variables: Record<string, unknown> = {};
    const outcomes: StepOutcome[] = [];
    const parallelIds = new Set(pipeline.parallel ?? []);

    // Collect parallel steps
    const parallelSteps = pipeline.steps.filter((s) => parallelIds.has(s.id));
    const sequentialSteps = pipeline.steps.filter((s) => !parallelIds.has(s.id));

    // Run parallel steps first (if any)
    if (parallelSteps.length > 0) {
      const parallelResults = await Promise.allSettled(
        parallelSteps.map((step) => this.executeStep(step, variables)),
      );

      for (let i = 0; i < parallelSteps.length; i++) {
        const step = parallelSteps[i];
        const settled = parallelResults[i];
        // Use explicit output name or fall back to step id
        const varName = step.output || step.id;
        if (settled.status === 'fulfilled') {
          outcomes.push(settled.value);
          if (settled.value.status === 'ok') {
            variables[varName] = settled.value.result;
            // Spread object results into top-level variables
            if (settled.value.result && typeof settled.value.result === 'object' && !Array.isArray(settled.value.result)) {
              for (const [key, value] of Object.entries(settled.value.result as Record<string, unknown>)) {
                if (!key.startsWith('_')) {
                  variables[key] = value;
                }
              }
            }
          }
        } else {
          const outcome = this.handleStepError(step, settled.reason);
          outcomes.push(outcome);
          if (outcome.status === 'ok') {
            variables[varName] = outcome.result;
          }
        }
      }
    }

    // Run sequential steps
    let aborted = false;
    for (const step of sequentialSteps) {
      if (aborted) {
        outcomes.push({ id: step.id, status: 'skipped', error: 'Pipeline aborted' });
        continue;
      }

      try {
        const outcome = await this.executeStep(step, variables);
        outcomes.push(outcome);
        // Use explicit output name or fall back to step id
        const varName = step.output || step.id;
        if (outcome.status === 'ok') {
          variables[varName] = outcome.result;
          // Also spread object results into top-level variables for easier template access
          // e.g., extract result {titles: [...]} → variables.titles = [...]
          if (outcome.result && typeof outcome.result === 'object' && !Array.isArray(outcome.result)) {
            for (const [key, value] of Object.entries(outcome.result as Record<string, unknown>)) {
              if (!key.startsWith('_')) {
                variables[key] = value;
              }
            }
          }
        }
        if (outcome.status === 'error' && step.onError === 'abort') {
          aborted = true;
        }
      } catch (err) {
        const outcome = this.handleStepError(step, err);
        outcomes.push(outcome);
        if (outcome.status === 'error' && (step.onError === 'abort' || !step.onError)) {
          aborted = true;
        }
      }
    }

    return {
      name: pipeline.name,
      steps: outcomes,
      variables,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Parse pipe shorthand syntax into a PipelineDef.
   * Format: "op:tab:selector | op:tab:selector | ..."
   */
  static parsePipeShorthand(pipeStr: string, name = 'pipe'): PipelineDef {
    const steps: PipelineStep[] = [];
    const segments = pipeStr.split('|').map((s) => s.trim()).filter(Boolean);

    for (let i = 0; i < segments.length; i++) {
      const parts = segments[i].split(':').map((p) => p.trim());
      const op = parts[0];
      const id = `s${i + 1}`;

      if (op === 'transform') {
        steps.push({
          id,
          op: 'transform',
          template: parts.slice(1).join(':').replace(/^['"]|['"]$/g, ''),
          output: `s${i + 1}_result`,
        });
      } else if (op === 'extract') {
        const tab = parts[1];
        const selector = parts.slice(2).join(':');
        steps.push({
          id,
          op: 'extract',
          tab,
          schema: { value: selector },
          output: `s${i + 1}_result`,
        });
      } else if (op === 'type') {
        const tab = parts[1];
        const selector = parts[2];
        steps.push({
          id,
          op: 'type',
          tab,
          selector,
          text: `{{s${i}_result}}`,
        });
      } else if (op === 'click') {
        steps.push({
          id,
          op: 'click',
          tab: parts[1],
          selector: parts[2],
        });
      } else if (op === 'read') {
        steps.push({
          id,
          op: 'read',
          tab: parts[1],
          selector: parts.slice(2).join(':'),
          output: `s${i + 1}_result`,
        });
      } else if (op === 'navigate') {
        steps.push({
          id,
          op: 'navigate',
          tab: parts[1],
          text: parts.slice(2).join(':'),
        });
      } else {
        steps.push({ id, op, tab: parts[1], selector: parts[2] });
      }
    }

    return { name, steps };
  }

  // ---- internal ----

  private async executeStep(
    step: PipelineStep,
    variables: Record<string, unknown>,
  ): Promise<StepOutcome> {
    const op = step.op;

    // Transform step — no tab needed, pure data manipulation
    if (op === 'transform') {
      const template = step.template ?? '';
      const result = resolveTemplate(template, variables);
      return { id: step.id, status: 'ok', result };
    }

    // Tab-based operations
    if (!step.tab) {
      return { id: step.id, status: 'error', error: `Step "${step.id}": no tab specified for op "${op}"` };
    }

    // Resolve the tab device ID
    const deviceId = this.resolveTabDevice(step.tab);
    if (!deviceId) {
      return { id: step.id, status: 'error', error: `Tab "${step.tab}" not found` };
    }

    // Resolve template variables in step fields
    const resolvedSelector = step.selector
      ? resolveTemplate(step.selector, variables)
      : undefined;
    const resolvedText = step.text
      ? resolveTemplate(step.text, variables)
      : undefined;

    try {
      let result: unknown;

      switch (op) {
        case 'extract': {
          const schema = step.schema ?? {};
          // Resolve templates in schema values
          const resolvedSchema: Record<string, string> = {};
          for (const [key, val] of Object.entries(schema)) {
            resolvedSchema[key] = resolveTemplate(val, variables);
          }
          result = await this.extBridge.callDevice({
            deviceId,
            op: 'extract',
            payload: { schema: resolvedSchema },
            timeoutMs: 15_000,
          });
          // Unwrap result.data.result if present (extension wraps in {result, _meta})
          if (result && typeof result === 'object') {
            const r = result as Record<string, unknown>;
            const data = r.data ?? r;
            if (data && typeof data === 'object') {
              const d = data as Record<string, unknown>;
              result = d.result ?? data;
            } else {
              result = data;
            }
          }
          break;
        }

        case 'click':
          result = await this.extBridge.callDevice({
            deviceId,
            op: 'click',
            payload: { selector: resolvedSelector },
            timeoutMs: 10_000,
          });
          break;

        case 'type':
          result = await this.extBridge.callDevice({
            deviceId,
            op: 'type',
            payload: { text: resolvedText, selector: resolvedSelector },
            timeoutMs: 10_000,
          });
          break;

        case 'read':
          result = await this.extBridge.callDevice({
            deviceId,
            op: 'read',
            payload: { selector: resolvedSelector },
            timeoutMs: 10_000,
          });
          break;

        case 'navigate':
          result = await this.extBridge.callDevice({
            deviceId,
            op: 'eval',
            payload: { expression: `window.location.href = ${JSON.stringify(resolvedText)}` },
            timeoutMs: 10_000,
          });
          break;

        default:
          // Generic op passthrough
          result = await this.extBridge.callDevice({
            deviceId,
            op,
            payload: {
              selector: resolvedSelector,
              text: resolvedText,
              schema: step.schema,
            },
            timeoutMs: 15_000,
          });
      }

      return { id: step.id, status: 'ok', result };
    } catch (err) {
      throw err; // Let the caller handle with onError
    }
  }

  private handleStepError(step: PipelineStep, err: unknown): StepOutcome {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const onError = step.onError ?? 'abort';

    if (onError === 'skip') {
      return { id: step.id, status: 'skipped', error: errorMsg };
    }

    return { id: step.id, status: 'error', error: errorMsg };
  }

  private resolveTabDevice(tabRef: string): string | null {
    // Tab ref can be a direct device ID or an app name.
    // First check if it looks like a device ID (tab-N format)
    if (tabRef.startsWith('tab-')) return tabRef;

    // Otherwise try to find by URL/title match
    for (const { tabs } of this.extBridge.listSharedTabs()) {
      for (const tab of tabs ?? []) {
        const url = (tab.url ?? '').toLowerCase();
        const title = (tab.title ?? '').toLowerCase();
        if (url.includes(tabRef.toLowerCase()) || title.includes(tabRef.toLowerCase())) {
          return tab.deviceId;
        }
      }
    }

    // If nothing matched, return the ref as-is (might be a device ID)
    return tabRef;
  }
}
