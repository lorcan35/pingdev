/** Code templates for PingApp generation. */

import type { SelectorDef } from '@pingdev/core';
import type { InferredAction, InferredState, SiteDefinitionResult } from '../types.js';

/** Convert a name like 'sendMessage' to kebab-case 'send-message'. */
function toKebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Convert a name like 'send-message' to camelCase 'sendMessage'. */
function toCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Escape single quotes in a string for use inside single-quoted template literals. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Generate package.json content. */
export function generatePackageJson(name: string, url: string): string {
  const pkg = {
    name: `@pingapps/${name}`,
    version: '0.1.0',
    description: `PingApp shim for ${url}`,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    type: 'commonjs',
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@pingdev/core': '^0.1.0',
    },
    devDependencies: {
      typescript: '^5.3.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

/** Generate tsconfig.json content. */
export function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: './dist',
      rootDir: './src',
      declaration: true,
      sourceMap: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };
  return JSON.stringify(config, null, 2) + '\n';
}

/** Generate selectors.ts source. */
export function generateSelectors(selectors: Record<string, SelectorDef>): string {
  const lines: string[] = [
    "import type { SelectorDef } from '@pingdev/core';",
    '',
    'export const selectors: Record<string, SelectorDef> = {',
  ];

  const entries = Object.entries(selectors);
  for (let i = 0; i < entries.length; i++) {
    const [key, sel] = entries[i];
    lines.push(`  '${esc(key)}': {`);
    lines.push(`    name: '${esc(sel.name)}',`);
    lines.push('    tiers: [');
    for (const tier of sel.tiers) {
      lines.push(`      '${esc(tier)}',`);
    }
    lines.push('    ],');
    lines.push(`  },`);
  }

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/** Generate states.ts source. */
export function generateStates(stateTransitions: Record<string, string[]>): string {
  const lines: string[] = [
    "import type { StateMachineConfig } from '@pingdev/core';",
    '',
    'export const stateConfig: StateMachineConfig = {',
    '  transitions: {',
  ];

  for (const [state, targets] of Object.entries(stateTransitions)) {
    const targetStr = targets.map((t) => `'${esc(t)}'`).join(', ');
    lines.push(`    '${esc(state)}': [${targetStr}],`);
  }

  lines.push('  },');
  lines.push("  initialState: 'IDLE',");
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/** Generate a single action file source. */
export function generateActionFile(
  action: InferredAction,
  selectors: Record<string, SelectorDef>,
): string {
  const camelName = toCamel(action.name);
  const lines: string[] = [
    "import type { ActionHandler } from '@pingdev/core';",
    "import { selectors } from '../selectors.js';",
    '',
  ];

  lines.push(`/** ${esc(action.description)} */`);
  lines.push(`export const ${camelName}: ActionHandler = async (ctx) => {`);

  if (action.inputSelector && selectors[action.inputSelector]) {
    lines.push(`  const input = await ctx.resolveSelector(selectors['${esc(action.inputSelector)}']);`);
    lines.push("  if (!input) throw new Error('Input element not found');");
    lines.push('  await input.fill(ctx.jobRequest.prompt);');
  }

  if (action.submitTrigger && selectors[action.submitTrigger]) {
    lines.push(`  const trigger = await ctx.resolveSelector(selectors['${esc(action.submitTrigger)}']);`);
    lines.push("  if (!trigger) throw new Error('Submit trigger not found');");
    lines.push('  await trigger.click();');
  }

  if (action.outputSelector && selectors[action.outputSelector]) {
    lines.push(`  const output = await ctx.resolveSelector(selectors['${esc(action.outputSelector)}']);`);
    lines.push("  if (!output) throw new Error('Output area not found');");
    lines.push('  return output.textContent();');
  }

  // If no selectors were matched, add a TODO placeholder
  if (!action.inputSelector && !action.submitTrigger && !action.outputSelector) {
    lines.push(`  // TODO: Implement ${action.description}`);
    lines.push(`  ctx.log.info('${esc(camelName)} action called');`);
  }

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/** Generate actions/index.ts barrel export. */
export function generateActionsIndex(actions: InferredAction[]): string {
  const lines: string[] = [
    "import type { ActionHandler } from '@pingdev/core';",
    '',
  ];

  // Import each action
  for (const action of actions) {
    const camelName = toCamel(action.name);
    const kebabName = toKebab(action.name);
    lines.push(`import { ${camelName} } from './${kebabName}.js';`);
  }

  lines.push('');
  lines.push('export const actions: Record<string, ActionHandler> = {');

  for (const action of actions) {
    const camelName = toCamel(action.name);
    lines.push(`  ${camelName},`);
  }

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/** Generate src/index.ts main entry point. */
export function generateMainIndex(
  name: string,
  url: string,
  actions: InferredAction[],
): string {
  const lines: string[] = [
    "import { defineSite, createShimApp } from '@pingdev/core';",
    "import { selectors } from './selectors.js';",
    "import { stateConfig } from './states.js';",
    "import { actions } from './actions/index.js';",
    '',
    'const site = defineSite({',
    `  name: '${esc(name)}',`,
    `  url: '${esc(url)}',`,
    '  selectors,',
    '  states: stateConfig,',
    '  actions: {',
  ];

  // Map inferred actions to the SiteDefinition action slots
  const actionMap = new Map(actions.map((a) => [a.name, a]));

  // Required action slots from SiteDefinition
  const requiredSlots = [
    'findOrCreatePage',
    'typePrompt',
    'submit',
    'isGenerating',
    'isResponseComplete',
    'extractResponse',
  ];

  // Optional action slots that SiteDefinition accepts
  const optionalSlots = [
    'preflight',
    'extractPartialResponse',
    'extractThinking',
    'extractProgressText',
    'dismissOverlays',
    'activateTool',
    'deactivateTool',
    'switchMode',
    'newConversation',
    'getCurrentUrl',
  ];

  const allKnownSlots = new Set([...requiredSlots, ...optionalSlots]);

  for (const slot of requiredSlots) {
    const camelSlot = toCamel(slot);
    if (actionMap.has(slot) || actionMap.has(camelSlot)) {
      lines.push(`    ${camelSlot}: actions['${camelSlot}'] ?? actions['${slot}'],`);
    } else {
      // Generate a placeholder
      lines.push(`    ${camelSlot}: async (ctx) => { ctx.log.warn('${camelSlot} not implemented'); },`);
    }
  }

  // Add optional slots only if they match a known SiteDefinition key
  for (const action of actions) {
    const camelName = toCamel(action.name);
    if (allKnownSlots.has(camelName)) continue; // already handled above
    // Custom actions that don't map to SiteDefinition slots — skip them
    // They're still available via the actions barrel export for direct use
  }

  lines.push('  },');
  lines.push('  completion: { method: \'hash_stability\', pollMs: 750, stableCount: 3, maxWaitMs: 120000 },');
  lines.push('});');
  lines.push('');
  lines.push('const app = createShimApp(site);');
  lines.push("app.start().then(() => console.log('PingApp running'));");
  lines.push('');
  return lines.join('\n');
}

/** Generate tests/actions.test.ts skeleton. */
export function generateTestFile(name: string, actions: InferredAction[]): string {
  const lines: string[] = [
    "import { describe, it, expect } from 'vitest';",
    '',
    `describe('${esc(name)} PingApp', () => {`,
  ];

  for (const action of actions) {
    const camelName = toCamel(action.name);
    lines.push(`  describe('${camelName}', () => {`);
    lines.push(`    it('should be defined', async () => {`);
    lines.push(`      const { actions } = await import('../src/actions/index.js');`);
    lines.push(`      expect(actions['${camelName}']).toBeDefined();`);
    lines.push('    });');
    lines.push('  });');
    lines.push('');
  }

  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

/** Generate README.md content. */
export function generateReadme(siteDefinition: SiteDefinitionResult): string {
  const lines: string[] = [
    `# PingApp: ${siteDefinition.name}`,
    '',
    `> Auto-generated PingApp shim for [${siteDefinition.url}](${siteDefinition.url})`,
    '',
    `**Category:** ${siteDefinition.category}`,
    `**Purpose:** ${siteDefinition.purpose}`,
    '',
    '## Actions',
    '',
  ];

  for (const action of siteDefinition.actions) {
    const primary = action.isPrimary ? ' (primary)' : '';
    lines.push(`- **${action.name}**${primary}: ${action.description}`);
  }

  lines.push('');
  lines.push('## States');
  lines.push('');

  for (const state of siteDefinition.states) {
    const transitions = state.transitions.length > 0 ? ` → ${state.transitions.join(', ')}` : '';
    lines.push(`- **${state.name}**: ${state.detectionMethod}${transitions}`);
  }

  lines.push('');
  lines.push('## Selectors');
  lines.push('');

  for (const [key, sel] of Object.entries(siteDefinition.selectors)) {
    lines.push(`- **${key}**: ${sel.tiers.length} tier(s)`);
  }

  lines.push('');
  lines.push('## Getting Started');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install');
  lines.push('npm run build');
  lines.push('npm start');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('*Generated by PingDev Recon*');
  lines.push('');
  return lines.join('\n');
}
