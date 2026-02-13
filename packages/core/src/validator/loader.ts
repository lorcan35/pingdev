import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SelectorDef, StateMachineConfig } from '../types.js';
import type { PingAppConfig } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger('pingapp-loader');

/**
 * Load a PingApp directory and parse its config from raw TypeScript sources.
 * Uses regex parsing — does NOT import or compile the TS files.
 */
export class PingAppLoader {
  constructor(private appDir: string) {}

  /** Load and return the full PingApp config. */
  load(): PingAppConfig {
    log.info({ appDir: this.appDir }, 'Loading PingApp config');

    const selectors = this.parseSelectors();
    const states = this.parseStates();
    const { name, url } = this.parseSiteInfo();

    log.info(
      { name, url, selectorCount: Object.keys(selectors).length },
      'PingApp config loaded',
    );

    return { name, url, selectors, states };
  }

  /** Parse selectors from src/selectors.ts */
  parseSelectors(): Record<string, SelectorDef> {
    const content = this.readFile('src/selectors.ts');
    const selectors: Record<string, SelectorDef> = {};

    // Match each selector block: 'name': { name: '...', tiers: [...] }
    const selectorPattern =
      /['"]([^'"]+)['"]\s*:\s*\{[^}]*?name\s*:\s*['"]([^'"]+)['"][^}]*?tiers\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;

    let match;
    while ((match = selectorPattern.exec(content)) !== null) {
      const key = match[1]!;
      const name = match[2]!;
      const tiersRaw = match[3]!;

      // Extract tier strings (single or double quoted, possibly with escaped chars)
      const tiers: string[] = [];
      const tierPattern = /[']((?:[^'\\]|\\.)*)['"]|["]((?:[^"\\]|\\.)*)["]/g;
      let tierMatch;
      while ((tierMatch = tierPattern.exec(tiersRaw)) !== null) {
        const value = tierMatch[1] ?? tierMatch[2] ?? '';
        tiers.push(value.replace(/\\'/g, "'").replace(/\\"/g, '"'));
      }

      if (tiers.length > 0) {
        selectors[key] = { name, tiers };
      }
    }

    log.debug({ count: Object.keys(selectors).length }, 'Parsed selectors');
    return selectors;
  }

  /** Parse state machine config from src/states.ts */
  parseStates(): StateMachineConfig {
    const content = this.readFile('src/states.ts');

    // Parse transitions block
    const transitionsMatch = content.match(/transitions\s*:\s*\{([\s\S]*?)\}\s*,/);
    const transitions: Record<string, string[]> = {};

    if (transitionsMatch) {
      const transBlock = transitionsMatch[1]!;
      const transPattern = /['"]?(\w+)['"]?\s*:\s*\[([\s\S]*?)\]/g;
      let tMatch;
      while ((tMatch = transPattern.exec(transBlock)) !== null) {
        const state = tMatch[1]!;
        const targets: string[] = [];
        const targetPattern = /['"](\w+)['"]/g;
        let targetMatch;
        while ((targetMatch = targetPattern.exec(tMatch[2]!)) !== null) {
          targets.push(targetMatch[1]!);
        }
        transitions[state] = targets;
      }
    }

    // Parse initialState
    const initialMatch = content.match(/initialState\s*:\s*['"](\w+)['"]/);
    const initialState = initialMatch ? initialMatch[1]! : 'IDLE';

    return { transitions, initialState };
  }

  /** Parse site name and URL from src/index.ts */
  parseSiteInfo(): { name: string; url: string } {
    const content = this.readFile('src/index.ts');

    const nameMatch = content.match(/name\s*:\s*['"]([^'"]+)['"]/);
    const urlMatch = content.match(/url\s*:\s*['"]([^'"]+)['"]/);

    const name = nameMatch ? nameMatch[1]! : 'unknown';
    const url = urlMatch ? urlMatch[1]! : 'http://localhost';

    return { name, url };
  }

  /** Read a file relative to the app directory. */
  private readFile(relativePath: string): string {
    const fullPath = join(this.appDir, relativePath);
    try {
      return readFileSync(fullPath, 'utf-8');
    } catch (err) {
      log.error({ path: fullPath, err }, 'Failed to read PingApp file');
      throw new Error(`Cannot read PingApp file: ${fullPath}`);
    }
  }
}
