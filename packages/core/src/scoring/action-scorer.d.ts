/** Score actions based on selector confidence and validation results. */
import type { SelectorDef } from '../types.js';
import type { ActionScore, ValidationResult } from './types.js';
/** Score an action's reliability based on its selectors and optional validation results. */
export declare function scoreAction(actionName: string, selectorDefs: SelectorDef[], validationResult?: ValidationResult): ActionScore;
//# sourceMappingURL=action-scorer.d.ts.map