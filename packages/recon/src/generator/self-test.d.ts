/** Self-test loop — tries to compile the generated PingApp and fix common errors. */
export interface SelfTestResult {
    compiles: boolean;
    errors: string[];
    attempts: number;
}
export declare class SelfTester {
    /** Try to build the generated PingApp, fix errors if possible. */
    test(outputDir: string, maxRetries?: number): Promise<SelfTestResult>;
    /** Run tsc --noEmit and collect errors. */
    private runTypeCheck;
    /** Attempt to fix common TypeScript errors. Returns true if any fix was applied. */
    private attemptFix;
    /** Add .js extension to relative imports missing it. */
    private fixMissingJsExtension;
    /** Add a missing import for common @pingdev/core types. */
    private fixMissingImport;
    /** Recursively find all .ts files in a directory. */
    private findTsFiles;
}
//# sourceMappingURL=self-test.d.ts.map