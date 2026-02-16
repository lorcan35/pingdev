import type { HealingLogEntry } from './types.js';
export declare class HealingLog {
    private filePath;
    constructor(filePath: string);
    /** Append a single log entry as a JSON line. */
    append(entry: HealingLogEntry): void;
    /** Read and parse all log entries. */
    read(): HealingLogEntry[];
    /** Clear the log file. */
    clear(): void;
}
//# sourceMappingURL=healing-log.d.ts.map