export interface HealingLogEntry {
    timestamp: string;
    selectorName: string;
    oldTiers: string[];
    newTiers: string[];
    error: string;
    fixed: boolean;
    source: 'runtime' | 'heal-command';
}
export interface RuntimeConfig {
    enableSelfHealing: boolean;
    healingLogPath: string;
    maxHealAttempts: number;
    llmEndpoint?: string;
    llmModel?: string;
    cdpUrl?: string;
}
export interface TestCase {
    name: string;
    action: string;
    input: Record<string, unknown>;
    expectedSelectorNames: string[];
    timestamp: string;
}
//# sourceMappingURL=types.d.ts.map