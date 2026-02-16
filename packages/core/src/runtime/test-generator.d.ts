import type { TestCase } from './types.js';
export declare class TestCaseGenerator {
    private outputDir;
    private casesPath;
    constructor(appDir: string);
    /** Record a new regression test case. */
    recordTestCase(action: string, input: Record<string, unknown>, selectorNames: string[]): void;
    /** Read all saved test cases. */
    getTestCases(): TestCase[];
}
//# sourceMappingURL=test-generator.d.ts.map