"use strict";
/** PingApp code generator — takes a SiteDefinitionResult and scaffolds a complete project. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PingAppGenerator = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const templates_js_1 = require("./templates.js");
/** Convert action name to kebab-case filename. */
function toKebab(name) {
    return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
class PingAppGenerator {
    /** Generate all file contents from a SiteDefinitionResult. Returns a Map of relative path → content. */
    preview(config) {
        const { siteDefinition } = config;
        const files = new Map();
        // Root config files
        files.set('package.json', (0, templates_js_1.generatePackageJson)(siteDefinition.name, siteDefinition.url));
        files.set('tsconfig.json', (0, templates_js_1.generateTsConfig)());
        // src/selectors.ts
        files.set('src/selectors.ts', (0, templates_js_1.generateSelectors)(siteDefinition.selectors));
        // src/states.ts
        files.set('src/states.ts', (0, templates_js_1.generateStates)(siteDefinition.stateTransitions));
        // src/actions/ — one file per action
        for (const action of siteDefinition.actions) {
            const filename = `src/actions/${toKebab(action.name)}.ts`;
            files.set(filename, (0, templates_js_1.generateActionFile)(action, siteDefinition.selectors));
        }
        // src/actions/index.ts — barrel
        files.set('src/actions/index.ts', (0, templates_js_1.generateActionsIndex)(siteDefinition.actions));
        // src/index.ts — main entry
        files.set('src/index.ts', (0, templates_js_1.generateMainIndex)(siteDefinition.name, siteDefinition.url, siteDefinition.actions));
        // tests/actions.test.ts
        files.set('tests/actions.test.ts', (0, templates_js_1.generateTestFile)(siteDefinition.name, siteDefinition.actions));
        // README.md
        files.set('README.md', (0, templates_js_1.generateReadme)(siteDefinition));
        return files;
    }
    /** Generate a complete PingApp from a SiteDefinitionResult and write to disk. */
    async generate(config) {
        const { outputDir } = config;
        const files = this.preview(config);
        const generatedFiles = [];
        // Create directory structure
        const dirs = new Set();
        for (const relPath of files.keys()) {
            const dir = (0, node_path_1.join)(outputDir, relPath, '..');
            dirs.add(dir);
        }
        for (const dir of dirs) {
            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        }
        // Write each file
        for (const [relPath, content] of files) {
            const absPath = (0, node_path_1.join)(outputDir, relPath);
            (0, node_fs_1.writeFileSync)(absPath, content, 'utf-8');
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
exports.PingAppGenerator = PingAppGenerator;
//# sourceMappingURL=generator.js.map