"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectorRegistry = void 0;
const node_events_1 = require("node:events");
class SelectorRegistry extends node_events_1.EventEmitter {
    selectors;
    version = 0;
    lastUpdated;
    constructor(initial) {
        super();
        // Deep clone to avoid mutating the input
        this.selectors = {};
        for (const [key, def] of Object.entries(initial)) {
            this.selectors[key] = { name: def.name, tiers: [...def.tiers] };
        }
        this.lastUpdated = new Date().toISOString();
    }
    /** Update a selector's tiers in-memory and increment the version. */
    hotPatch(name, newTiers) {
        const existing = this.selectors[name];
        if (existing) {
            existing.tiers = [...newTiers];
        }
        else {
            this.selectors[name] = { name, tiers: [...newTiers] };
        }
        this.version++;
        this.lastUpdated = new Date().toISOString();
        this.emit('patched', { name, newTiers, version: this.version });
    }
    /** Get a single selector by name. */
    getSelector(name) {
        return this.selectors[name];
    }
    /** Get all selectors. */
    getAllSelectors() {
        return this.selectors;
    }
    /** Get the current version number. */
    getVersion() {
        return this.version;
    }
    /** Serialize to JSON-safe object. */
    toJSON() {
        return {
            selectors: this.selectors,
            version: this.version,
            lastUpdated: this.lastUpdated,
        };
    }
}
exports.SelectorRegistry = SelectorRegistry;
//# sourceMappingURL=selector-registry.js.map