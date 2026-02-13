/** Self-test loop — tries to compile the generated PingApp and fix common errors. */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface SelfTestResult {
  compiles: boolean;
  errors: string[];
  attempts: number;
}

export class SelfTester {
  /** Try to build the generated PingApp, fix errors if possible. */
  async test(outputDir: string, maxRetries = 3): Promise<SelfTestResult> {
    let attempts = 0;
    let errors: string[] = [];

    // Install dependencies first
    try {
      execSync('npm install --ignore-scripts', { cwd: outputDir, stdio: 'pipe', timeout: 60_000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { compiles: false, errors: [`npm install failed: ${msg}`], attempts: 0 };
    }

    while (attempts <= maxRetries) {
      attempts++;
      errors = this.runTypeCheck(outputDir);

      if (errors.length === 0) {
        return { compiles: true, errors: [], attempts };
      }

      if (attempts > maxRetries) {
        break;
      }

      // Attempt to fix common errors
      const fixed = this.attemptFix(outputDir, errors);
      if (!fixed) {
        break; // No fixable errors found, stop retrying
      }
    }

    return { compiles: false, errors, attempts };
  }

  /** Run tsc --noEmit and collect errors. */
  private runTypeCheck(outputDir: string): string[] {
    try {
      execSync('npx tsc --noEmit', { cwd: outputDir, stdio: 'pipe', timeout: 30_000 });
      return [];
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (err as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = stderr + stdout;
      // Parse TSC error lines
      const errorLines = output
        .split('\n')
        .filter((line) => /error TS\d+/.test(line))
        .map((line) => line.trim());
      return errorLines.length > 0 ? errorLines : [output.slice(0, 500)];
    }
  }

  /** Attempt to fix common TypeScript errors. Returns true if any fix was applied. */
  private attemptFix(outputDir: string, errors: string[]): boolean {
    let anyFixed = false;

    for (const error of errors) {
      // Fix: Cannot find module '...' — missing .js extension
      const missingModuleMatch = error.match(/Cannot find module '([^']+)'/);
      if (missingModuleMatch) {
        const mod = missingModuleMatch[1];
        if (!mod.endsWith('.js') && mod.startsWith('.')) {
          // Find the file that has this import and add .js
          anyFixed = this.fixMissingJsExtension(outputDir, mod) || anyFixed;
        }
      }

      // Fix: Property '...' does not exist on type
      const propertyMatch = error.match(/Property '([^']+)' does not exist on type '([^']+)'/);
      if (propertyMatch) {
        // Log but don't attempt automatic fix for property errors
        continue;
      }

      // Fix: Missing import for a known type
      const importMatch = error.match(/Cannot find name '([^']+)'/);
      if (importMatch) {
        const name = importMatch[1];
        anyFixed = this.fixMissingImport(outputDir, error, name) || anyFixed;
      }
    }

    return anyFixed;
  }

  /** Add .js extension to relative imports missing it. */
  private fixMissingJsExtension(outputDir: string, modulePath: string): boolean {
    const srcDir = join(outputDir, 'src');
    const files = this.findTsFiles(srcDir);
    let fixed = false;

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const pattern = `from '${modulePath}'`;
      if (content.includes(pattern)) {
        const newContent = content.replace(pattern, `from '${modulePath}.js'`);
        writeFileSync(file, newContent, 'utf-8');
        fixed = true;
      }
    }

    return fixed;
  }

  /** Add a missing import for common @pingdev/core types. */
  private fixMissingImport(outputDir: string, errorLine: string, name: string): boolean {
    const coreTypes = ['ActionHandler', 'ActionContext', 'SelectorDef', 'StateMachineConfig', 'CompletionConfig'];
    if (!coreTypes.includes(name)) return false;

    // Find which file has the error
    const fileMatch = errorLine.match(/^(.+\.ts)\(\d+,\d+\)/);
    if (!fileMatch) return false;

    const filePath = join(outputDir, fileMatch[1]);
    if (!existsSync(filePath)) return false;

    const content = readFileSync(filePath, 'utf-8');
    if (content.includes(`import type { ${name} }`)) return false;

    // Add the import at the top
    const importLine = `import type { ${name} } from '@pingdev/core';\n`;
    writeFileSync(filePath, importLine + content, 'utf-8');
    return true;
  }

  /** Recursively find all .ts files in a directory. */
  private findTsFiles(dir: string): string[] {
    const results: string[] = [];

    if (!existsSync(dir)) return results;

    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...this.findTsFiles(full));
      } else if (entry.endsWith('.ts')) {
        results.push(full);
      }
    }

    return results;
  }
}
