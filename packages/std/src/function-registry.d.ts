/**
 * Tab-as-a-Function — Function Registry
 *
 * Auto-registers PingApps and browser tabs as callable functions.
 * Each tab becomes a set of named functions with typed parameters.
 *
 * Generic tabs get: extract, click, type, read, eval
 * PingApps get their specific endpoints exposed as functions.
 */
import type { FunctionDef } from './types.js';
import type { ExtensionBridge } from './ext-bridge.js';
export interface PingAppFunctionDef {
    app: string;
    domain: string;
    functions: Array<{
        name: string;
        description: string;
        params: Array<{
            name: string;
            type: string;
            required?: boolean;
            description?: string;
        }>;
    }>;
}
export declare class FunctionRegistry {
    private apps;
    private extBridge;
    private pingAppDefs;
    constructor(extBridge: ExtensionBridge);
    /** Register PingApp function definitions (from app-routes). */
    registerPingApps(defs: PingAppFunctionDef[]): void;
    /** Refresh the registry from currently connected tabs. */
    refresh(): void;
    /** List all callable functions across all tabs. */
    listAll(): FunctionDef[];
    /** List functions for a specific app/tab. */
    listForApp(appName: string): FunctionDef[] | null;
    /** Describe a specific function. */
    describe(qualifiedName: string): FunctionDef | null;
    /** Get the tab/device ID for an app name. */
    getTabId(appName: string): string | null;
    /**
     * Call a function by qualified name.
     * Returns the result from the extension bridge.
     */
    call(qualifiedName: string, params: Record<string, unknown>): Promise<unknown>;
    /**
     * Execute a batch of function calls in sequence.
     */
    batch(calls: Array<{
        function: string;
        params: Record<string, unknown>;
    }>): Promise<unknown[]>;
    private deriveAppName;
    private buildFunctions;
}
//# sourceMappingURL=function-registry.d.ts.map