/** LLM prompts for selector healing. */
import type { ChatMessage } from '../analyzer/llm-client.js';
/**
 * Build a prompt asking the LLM to fix broken selectors based on the
 * current ARIA tree and error context.
 */
export declare function buildHealingPrompt(actionName: string, errorMessage: string, oldSelectors: Record<string, string[]>, ariaTreeText: string, pageUrl: string): ChatMessage[];
//# sourceMappingURL=prompts.d.ts.map