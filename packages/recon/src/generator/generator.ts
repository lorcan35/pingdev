/** PingApp code generator — takes a SiteDefinitionResult and scaffolds a complete project. */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GeneratorConfig, GeneratorResult, SiteDefinitionResult } from '../types.js';
import {
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

/** Convert action name to kebab-case filename. */
function toKebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export class PingAppGenerator {
  /** Generate all file contents from a SiteDefinitionResult. Returns a Map of relative path → content. */
  preview(config: GeneratorConfig): Map<string, string> {
    const { siteDefinition } = config;
    const files = new Map<string, string>();

    // Root config files
    files.set('package.json', generatePackageJson(siteDefinition.name, siteDefinition.url));
    files.set('tsconfig.json', generateTsConfig());

    // src/selectors.ts
    files.set('src/selectors.ts', generateSelectors(siteDefinition.selectors));

    // src/states.ts
    files.set('src/states.ts', generateStates(siteDefinition.stateTransitions));

    // src/actions/ — one file per action
    for (const action of siteDefinition.actions) {
      const filename = `src/actions/${toKebab(action.name)}.ts`;
      files.set(filename, generateActionFile(action, siteDefinition.selectors));
    }

    // src/actions/index.ts — barrel
    files.set('src/actions/index.ts', generateActionsIndex(siteDefinition.actions));

    // src/index.ts — main entry
    files.set('src/index.ts', generateMainIndex(siteDefinition.name, siteDefinition.url, siteDefinition.actions));

    // tests/actions.test.ts
    files.set('tests/actions.test.ts', generateTestFile(siteDefinition.name, siteDefinition.actions));

    // README.md
    files.set('README.md', generateReadme(siteDefinition));

    return files;
  }

  /** Generate a complete PingApp from a SiteDefinitionResult and write to disk. */
  async generate(config: GeneratorConfig): Promise<GeneratorResult> {
    const { outputDir } = config;
    const files = this.preview(config);
    const generatedFiles: string[] = [];

    // Create directory structure
    const dirs = new Set<string>();
    for (const relPath of files.keys()) {
      const dir = join(outputDir, relPath, '..');
      dirs.add(dir);
    }
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }

    // Write each file
    for (const [relPath, content] of files) {
      const absPath = join(outputDir, relPath);
      writeFileSync(absPath, content, 'utf-8');
      generatedFiles.push(relPath);
    }

    return {
      outputDir,
      generatedFiles,
      compiles: false, // will be updated by self-test
      buildErrors: [],
      fixAttempts: 0,
    };
  }
}
