/** Healer module — auto-fix broken selectors using LLM + ARIA snapshots. */

export { Healer } from './healer.js';
export { buildHealingPrompt } from './prompts.js';
export { readSelectorsFile, writeSelectorsFile, applyPatches } from './patcher.js';
export type {
  HealingPatch,
  HealingAttempt,
  HealingReport,
  HealingResult,
  HealerOptions,
} from './types.js';
