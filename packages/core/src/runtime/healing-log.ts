import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HealingLogEntry } from './types.js';

export class HealingLog {
  constructor(private filePath: string) {
    // Ensure the directory exists
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** Append a single log entry as a JSON line. */
  append(entry: HealingLogEntry): void {
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /** Read and parse all log entries. */
  read(): HealingLogEntry[] {
    if (!existsSync(this.filePath)) {
      return [];
    }
    const content = readFileSync(this.filePath, 'utf-8').trim();
    if (!content) {
      return [];
    }
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as HealingLogEntry);
  }

  /** Clear the log file. */
  clear(): void {
    writeFileSync(this.filePath, '', 'utf-8');
  }
}
