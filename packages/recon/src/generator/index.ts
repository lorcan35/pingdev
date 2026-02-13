/** @pingdev/recon generator — scaffolds PingApp projects from site definitions. */

export { PingAppGenerator } from './generator.js';
export { SelfTester, type SelfTestResult } from './self-test.js';
export {
  generatePackageJson,
  generateTsConfig,
  generateSelectors,
  generateStates,
  generateActionFile,
  generateActionsIndex,
  generateMainIndex,
  generateTestFile,
  generateReadme,
} from './templates.js';
