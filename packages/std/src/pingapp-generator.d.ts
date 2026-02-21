/**
 * PingApp Generator — Auto-generate PingApp definitions from recordings.
 *
 * Takes a recording (sequence of user actions with selectors) and produces:
 * - manifest.json with site metadata
 * - workflows/*.json with the recorded workflow
 * - selectors.json with all captured selectors
 * - A basic test definition
 */
import type { Recording } from './types.js';
export interface GeneratedPingApp {
    manifest: PingAppManifest;
    workflow: PingAppWorkflow;
    selectors: Record<string, SelectorEntry>;
    test: PingAppTest;
}
interface PingAppManifest {
    name: string;
    url: string;
    description: string;
    version: string;
    recordedAt: number;
    actionCount: number;
}
interface PingAppWorkflow {
    name: string;
    description: string;
    steps: WorkflowStep[];
}
interface WorkflowStep {
    op: string;
    selector?: string;
    value?: string;
    description: string;
}
interface SelectorEntry {
    primary: string;
    fallbacks: string[];
    confidence: number;
}
interface PingAppTest {
    name: string;
    steps: Array<{
        op: string;
        selector?: string;
        value?: string;
        expect?: string;
    }>;
}
export interface GeneratePingAppViaLLMInput {
    url: string;
    description: string;
    domContext: string;
}
export declare class PingAppGenerator {
    /**
     * Generate a PingApp definition from a recording.
     */
    generate(recording: Recording, name?: string): GeneratedPingApp;
    /**
     * Serialize a generated PingApp to a flat file map (path → content).
     */
    serialize(app: GeneratedPingApp): Record<string, string>;
    private deriveAppName;
    private collectSelectors;
    private selectorKey;
    private buildWorkflow;
    private buildManifest;
    private buildTest;
}
export declare function generatePingAppViaLLM(input: GeneratePingAppViaLLMInput): Promise<Record<string, unknown>>;
export {};
//# sourceMappingURL=pingapp-generator.d.ts.map