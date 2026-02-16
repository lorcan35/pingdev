"use strict";
/** Self-test loop — tries to compile the generated PingApp and fix common errors. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfTester = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
class SelfTester {
    /** Try to build the generated PingApp, fix errors if possible. */
    async test(outputDir, maxRetries = 3) {
        let attempts = 0;
        let errors = [];
        // Install dependencies first
        try {
            (0, node_child_process_1.execSync)('npm install --ignore-scripts', { cwd: outputDir, stdio: 'pipe', timeout: 60_000 });
        }
        catch (err) {
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
    runTypeCheck(outputDir) {
        try {
            (0, node_child_process_1.execSync)('npx tsc --noEmit', { cwd: outputDir, stdio: 'pipe', timeout: 30_000 });
            return [];
        }
        catch (err) {
            const stderr = err?.stderr?.toString() ?? '';
            const stdout = err?.stdout?.toString() ?? '';
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
    attemptFix(outputDir, errors) {
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
    fixMissingJsExtension(outputDir, modulePath) {
        const srcDir = (0, node_path_1.join)(outputDir, 'src');
        const files = this.findTsFiles(srcDir);
        let fixed = false;
        for (const file of files) {
            const content = (0, node_fs_1.readFileSync)(file, 'utf-8');
            const pattern = `from '${modulePath}'`;
            if (content.includes(pattern)) {
                const newContent = content.replace(pattern, `from '${modulePath}.js'`);
                (0, node_fs_1.writeFileSync)(file, newContent, 'utf-8');
                fixed = true;
            }
        }
        return fixed;
    }
    /** Add a missing import for common @pingdev/core types. */
    fixMissingImport(outputDir, errorLine, name) {
        const coreTypes = ['ActionHandler', 'ActionContext', 'SelectorDef', 'StateMachineConfig', 'CompletionConfig'];
        if (!coreTypes.includes(name))
            return false;
        // Find which file has the error
        const fileMatch = errorLine.match(/^(.+\.ts)\(\d+,\d+\)/);
        if (!fileMatch)
            return false;
        const filePath = (0, node_path_1.join)(outputDir, fileMatch[1]);
        if (!(0, node_fs_1.existsSync)(filePath))
            return false;
        const content = (0, node_fs_1.readFileSync)(filePath, 'utf-8');
        if (content.includes(`import type { ${name} }`))
            return false;
        // Add the import at the top
        const importLine = `import type { ${name} } from '@pingdev/core';\n`;
        (0, node_fs_1.writeFileSync)(filePath, importLine + content, 'utf-8');
        return true;
    }
    /** Recursively find all .ts files in a directory. */
    findTsFiles(dir) {
        const results = [];
        if (!(0, node_fs_1.existsSync)(dir))
            return results;
        for (const entry of (0, node_fs_1.readdirSync)(dir)) {
            const full = (0, node_path_1.join)(dir, entry);
            const stat = (0, node_fs_1.statSync)(full);
            if (stat.isDirectory()) {
                results.push(...this.findTsFiles(full));
            }
            else if (entry.endsWith('.ts')) {
                results.push(full);
            }
        }
        return results;
    }
}
exports.SelfTester = SelfTester;
//# sourceMappingURL=self-test.js.map