"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealingLog = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
class HealingLog {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
        // Ensure the directory exists
        const dir = (0, node_path_1.dirname)(this.filePath);
        if (!(0, node_fs_1.existsSync)(dir)) {
            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        }
    }
    /** Append a single log entry as a JSON line. */
    append(entry) {
        (0, node_fs_1.appendFileSync)(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
    }
    /** Read and parse all log entries. */
    read() {
        if (!(0, node_fs_1.existsSync)(this.filePath)) {
            return [];
        }
        const content = (0, node_fs_1.readFileSync)(this.filePath, 'utf-8').trim();
        if (!content) {
            return [];
        }
        return content
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line));
    }
    /** Clear the log file. */
    clear() {
        (0, node_fs_1.writeFileSync)(this.filePath, '', 'utf-8');
    }
}
exports.HealingLog = HealingLog;
//# sourceMappingURL=healing-log.js.map