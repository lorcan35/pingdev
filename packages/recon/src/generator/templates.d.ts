/** Code templates for PingApp generation. */
import type { SelectorDef } from '@pingdev/core';
import type { InferredAction, SiteDefinitionResult } from '../types.js';
/** Generate package.json content. */
export declare function generatePackageJson(name: string, url: string): string;
/** Generate tsconfig.json content. */
export declare function generateTsConfig(): string;
/** Generate selectors.ts source. */
export declare function generateSelectors(selectors: Record<string, SelectorDef>): string;
/** Generate states.ts source. */
export declare function generateStates(stateTransitions: Record<string, string[]>): string;
/** Generate a single action file source. */
export declare function generateActionFile(action: InferredAction, selectors: Record<string, SelectorDef>): string;
/** Generate actions/index.ts barrel export. */
export declare function generateActionsIndex(actions: InferredAction[]): string;
/** Generate src/index.ts main entry point. */
export declare function generateMainIndex(name: string, url: string, actions: InferredAction[]): string;
/** Generate tests/actions.test.ts skeleton. */
export declare function generateTestFile(name: string, actions: InferredAction[]): string;
/** Generate README.md content. */
export declare function generateReadme(siteDefinition: SiteDefinitionResult): string;
//# sourceMappingURL=templates.d.ts.map