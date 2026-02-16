"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestCaseGenerator = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const REGRESSION_DIR = 'tests/regression';
const CASES_FILE = 'cases.json';
class TestCaseGenerator {
    outputDir;
    casesPath;
    constructor(appDir) {
        this.outputDir = (0, node_path_1.join)(appDir, REGRESSION_DIR);
        this.casesPath = (0, node_path_1.join)(this.outputDir, CASES_FILE);
    }
    /** Record a new regression test case. */
    recordTestCase(action, input, selectorNames) {
        // Ensure directory exists
        if (!(0, node_fs_1.existsSync)(this.outputDir)) {
            (0, node_fs_1.mkdirSync)(this.outputDir, { recursive: true });
        }
        const cases = this.getTestCases();
        const testCase = {
            name: `${action}_${Date.now()}`,
            action,
            input,
            expectedSelectorNames: selectorNames,
            timestamp: new Date().toISOString(),
        };
        cases.push(testCase);
        (0, node_fs_1.writeFileSync)(this.casesPath, JSON.stringify(cases, null, 2), 'utf-8');
    }
    /** Read all saved test cases. */
    getTestCases() {
        if (!(0, node_fs_1.existsSync)(this.casesPath)) {
            return [];
        }
        try {
            const content = (0, node_fs_1.readFileSync)(this.casesPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return [];
        }
    }
}
exports.TestCaseGenerator = TestCaseGenerator;
//# sourceMappingURL=test-generator.js.map