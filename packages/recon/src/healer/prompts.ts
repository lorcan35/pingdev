/** LLM prompts for selector healing. */

import type { ChatMessage } from '../analyzer/llm-client.js';

/**
 * Build a prompt asking the LLM to fix broken selectors based on the
 * current ARIA tree and error context.
 */
export function buildHealingPrompt(
  actionName: string,
  errorMessage: string,
  oldSelectors: Record<string, string[]>,
  ariaTreeText: string,
  pageUrl: string,
): ChatMessage[] {
  const selectorBlock = Object.entries(oldSelectors)
    .map(([name, tiers]) => `  "${name}": ${JSON.stringify(tiers)}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are a Playwright selector repair tool. A PingDev automation action failed because one or more selectors could not find matching elements on the live page.

Your job:
1. Examine the current ARIA tree of the page.
2. Compare it with the old selector tiers that failed.
3. Produce corrected selector tiers that match elements present in the ARIA tree.

Selector tier format: each selector is a Playwright selector string. Common patterns:
- CSS: "button.submit", "[data-testid='send']"
- Role: "role=button[name='Send']"
- Text: "text=Send message"
- ARIA: "[aria-label='Send message']"

Respond with JSON only:
{
  "selectors": {
    "<selectorName>": { "tiers": ["tier1", "tier2", ...] }
  },
  "reasoning": "Brief explanation of what changed and why"
}`,
    },
    {
      role: 'user',
      content: `Action "${actionName}" failed on page: ${pageUrl}

Error: ${errorMessage}

Old selector tiers that failed:
${selectorBlock}

Current page ARIA tree:
${ariaTreeText}

Analyze the ARIA tree and provide corrected selector tiers that will match elements currently on the page.`,
    },
  ];
}
