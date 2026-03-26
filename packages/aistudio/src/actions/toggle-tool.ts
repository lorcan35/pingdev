import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Tool name → selector key mapping. */
const TOOL_SELECTOR_MAP: Record<string, string> = {
  'structured-outputs': 'structured-outputs-toggle',
  'code-execution': 'code-execution-toggle',
  'function-calling': 'function-calling-toggle',
  'grounding': 'grounding-toggle',
  'url-context': 'url-context-toggle',
};

/** Toggle a tool on/off via their switch controls. */
export const toggleTool: ActionHandler = async (ctx) => {
  const toolName = ctx.jobRequest.tool;
  if (!toolName) {
    ctx.log.warn('No tool specified in jobRequest.tool');
    return;
  }

  const selectorKey = TOOL_SELECTOR_MAP[toolName];
  if (!selectorKey || !selectors[selectorKey]) {
    ctx.log.warn({ tool: toolName }, 'Unknown tool or missing selector');
    return;
  }

  const toggle = await ctx.resolveSelector(selectors[selectorKey], 5000);
  if (!toggle) {
    ctx.log.warn({ tool: toolName }, 'Tool toggle not found');
    return;
  }

  await toggle.click();
  ctx.log.info({ tool: toolName }, 'Tool toggled');
};
