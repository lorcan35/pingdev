import type { SelectorDef, StateMachineConfig } from '../types.js';
import type { PingAppConfig } from './types.js';
/**
 * Load a PingApp directory and parse its config from raw TypeScript sources.
 * Uses regex parsing — does NOT import or compile the TS files.
 */
export declare class PingAppLoader {
    private appDir;
    constructor(appDir: string);
    /** Load and return the full PingApp config. */
    load(): PingAppConfig;
    /** Parse selectors from src/selectors.ts */
    parseSelectors(): Record<string, SelectorDef>;
    /** Parse state machine config from src/states.ts */
    parseStates(): StateMachineConfig;
    /** Parse site name and URL from src/index.ts */
    parseSiteInfo(): {
        name: string;
        url: string;
    };
    /** Read a file relative to the app directory. */
    private readFile;
}
//# sourceMappingURL=loader.d.ts.map