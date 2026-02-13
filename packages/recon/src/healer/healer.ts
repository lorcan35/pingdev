/** Healer — auto-fix broken selectors using LLM + live ARIA snapshots. */

import { chromium, type Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { LLMClient } from '../analyzer/llm-client.js';
import { captureAriaTree } from '../snapshot/aria.js';
import { buildHealingPrompt } from './prompts.js';
import { readSelectorsFile, applyPatches } from './patcher.js';
import type { AriaNode } from '../types.js';
import type {
  HealerOptions,
  HealingAttempt,
  HealingPatch,
  HealingReport,
  HealingResult,
} from './types.js';

const log = createLogger('healer');

interface FailedAction {
  actionName: string;
  error: string;
  selectorName: string;
}

interface LLMHealingResponse {
  selectors: Record<string, { tiers: string[] }>;
  reasoning: string;
}

/** Serialize an ARIA tree to a readable text format for LLM consumption. */
function ariaTreeToText(nodes: AriaNode[], indent: number = 0): string {
  const pad = '  '.repeat(indent);
  return nodes
    .map((node) => {
      let line = `${pad}[${node.role}]`;
      if (node.name) line += ` "${node.name}"`;
      if (node.value) line += ` value="${node.value}"`;
      if (node.description) line += ` desc="${node.description}"`;
      if (node.disabled) line += ' (disabled)';
      if (node.checked !== undefined) line += ` checked=${node.checked}`;
      if (node.expanded !== undefined) line += ` expanded=${node.expanded}`;
      if (node.level !== undefined) line += ` level=${node.level}`;
      const childText = node.children
        ? '\n' + ariaTreeToText(node.children, indent + 1)
        : '';
      return line + childText;
    })
    .join('\n');
}

export class Healer {
  private appDir: string;
  private cdpUrl: string;
  private maxRetries: number;
  private llm: LLMClient;

  constructor(appDir: string, options?: HealerOptions) {
    this.appDir = appDir;
    this.cdpUrl = options?.cdpUrl ?? 'http://127.0.0.1:18800';
    this.maxRetries = options?.maxRetries ?? 3;
    this.llm = new LLMClient({
      endpoint: options?.llmEndpoint,
      model: options?.llmModel,
    });
  }

  /**
   * Heal failed actions by capturing ARIA snapshots, asking the LLM
   * for corrected selectors, patching the file, and validating.
   */
  async heal(failedActions: FailedAction[]): Promise<HealingResult> {
    const start = Date.now();
    const reports: HealingReport[] = [];

    // Connect to the browser via CDP
    const browser = await chromium.connectOverCDP(this.cdpUrl);
    try {
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser contexts found');
      }
      const pages = contexts[0]!.pages();
      if (pages.length === 0) {
        throw new Error('No pages found in browser context');
      }
      const page = pages[0]!;

      for (const action of failedActions) {
        const report = await this.healAction(page, action);
        reports.push(report);
      }
    } finally {
      await browser.close().catch(() => {});
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
  private async healAction(
    page: Page,
    action: FailedAction,
  ): Promise<HealingReport> {
    const attempts: HealingAttempt[] = [];
    let fixed = false;
    let finalPatches: HealingPatch[] = [];

    for (let i = 1; i <= this.maxRetries; i++) {
      const attempt = await this.attemptHeal(page, action, i);
      attempts.push(attempt);

      if (attempt.validationPassed) {
        fixed = true;
        finalPatches = attempt.patches;
        break;
      }

      log.warn(
        { actionName: action.actionName, attempt: i, error: attempt.error },
        'Healing attempt failed, retrying...',
      );
    }

    return {
      actionName: action.actionName,
      attempts,
      fixed,
      finalPatches,
    };
  }

  /** Single healing attempt: snapshot → LLM → patch → validate. */
  private async attemptHeal(
    page: Page,
    action: FailedAction,
    attemptNumber: number,
  ): Promise<HealingAttempt> {
    try {
      // 1. Capture current ARIA tree
      const ariaTree = await captureAriaTree(page);
      const ariaText = ariaTreeToText(ariaTree);

      // 2. Read current selectors
      const currentSelectors = readSelectorsFile(this.appDir);
      const selectorDef = currentSelectors[action.selectorName];
      const oldTiers = selectorDef?.tiers ?? [];

      // 3. Build prompt and ask LLM
      const prompt = buildHealingPrompt(
        action.actionName,
        action.error,
        { [action.selectorName]: oldTiers },
        ariaText,
        page.url(),
      );

      log.info(
        { actionName: action.actionName, attempt: attemptNumber },
        'Sending healing request to LLM',
      );

      const response = await this.llm.chatJSON<LLMHealingResponse>(prompt);

      // 4. Extract patches from LLM response
      const patches: HealingPatch[] = [];
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
      const updatedSelectors = applyPatches(this.appDir, patches);

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

      const locator = await resolveSelector(page, healedDef, 5000);
      const validationPassed = locator !== null;

      if (validationPassed) {
        log.info(
          { actionName: action.actionName, attempt: attemptNumber },
          'Healing succeeded — selector resolved',
        );
      }

      return {
        attemptNumber,
        patches,
        validationPassed,
        error: validationPassed ? undefined : 'Healed selector did not resolve on page',
      };
    } catch (err) {
      return {
        attemptNumber,
        patches: [],
        validationPassed: false,
        error: `Healing error: ${(err as Error).message}`,
      };
    }
  }
}
