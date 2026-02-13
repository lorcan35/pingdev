import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestCase } from './types.js';

const REGRESSION_DIR = 'tests/regression';
const CASES_FILE = 'cases.json';

export class TestCaseGenerator {
  private outputDir: string;
  private casesPath: string;

  constructor(appDir: string) {
    this.outputDir = join(appDir, REGRESSION_DIR);
    this.casesPath = join(this.outputDir, CASES_FILE);
  }

  /** Record a new regression test case. */
  recordTestCase(
    action: string,
    input: Record<string, unknown>,
    selectorNames: string[],
  ): void {
    // Ensure directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const cases = this.getTestCases();

    const testCase: TestCase = {
      name: `${action}_${Date.now()}`,
      action,
      input,
      expectedSelectorNames: selectorNames,
      timestamp: new Date().toISOString(),
    };

    cases.push(testCase);
    writeFileSync(this.casesPath, JSON.stringify(cases, null, 2), 'utf-8');
  }

  /** Read all saved test cases. */
  getTestCases(): TestCase[] {
    if (!existsSync(this.casesPath)) {
      return [];
    }
    try {
      const content = readFileSync(this.casesPath, 'utf-8');
      return JSON.parse(content) as TestCase[];
    } catch {
      return [];
    }
  }
}
