/** Score actions based on selector confidence and validation results. */

import type { SelectorDef } from '../types.js';
import type { ActionScore, ValidationResult } from './types.js';
import { scoreSelectorDef } from './selector-scorer.js';

/** Score an action's reliability based on its selectors and optional validation results. */
export function scoreAction(
  actionName: string,
  selectorDefs: SelectorDef[],
  validationResult?: ValidationResult,
): ActionScore {
  // Score each selector def and take the best (highest confidence) from each
  const selectorScores = selectorDefs.flatMap(def => scoreSelectorDef(def));

  // Best confidence per selector name
  const bestByName = new Map<string, number>();
  for (const score of selectorScores) {
    const current = bestByName.get(score.name) ?? 0;
    if (score.confidence > current) {
      bestByName.set(score.name, score.confidence);
    }
  }

  // Average of best selector confidences
  const bestScores = [...bestByName.values()];
  const avgSelectorConfidence = bestScores.length > 0
    ? bestScores.reduce((sum, s) => sum + s, 0) / bestScores.length
    : 0;

  // Validation metrics
  let testPassRate = 1;
  let avgTiming_ms = 0;
  let timingConsistency = 1;

  if (validationResult) {
    const total = validationResult.passed + validationResult.failed;
    testPassRate = total > 0 ? validationResult.passed / total : 0;

    const timings = validationResult.timings_ms;
    if (timings.length > 0) {
      avgTiming_ms = timings.reduce((s, t) => s + t, 0) / timings.length;

      // Timing consistency: 1 - coefficient of variation (clamped to [0, 1])
      const mean = avgTiming_ms;
      if (mean > 0) {
        const variance = timings.reduce((s, t) => s + (t - mean) ** 2, 0) / timings.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean;
        timingConsistency = Math.max(0, Math.min(1, 1 - cv));
      }
    }
  }

  // Weighted overall: 60% selector confidence, 30% pass rate, 10% timing consistency
  const overallScore =
    avgSelectorConfidence * 0.6 +
    testPassRate * 0.3 +
    timingConsistency * 0.1;

  return {
    actionName,
    selectorScores,
    testPassRate,
    avgTiming_ms: Math.round(avgTiming_ms * 100) / 100,
    timingConsistency: Math.round(timingConsistency * 1000) / 1000,
    overallScore: Math.round(overallScore * 1000) / 1000,
  };
}
