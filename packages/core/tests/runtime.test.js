"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const selector_registry_js_1 = require("../src/runtime/selector-registry.js");
const healing_log_js_1 = require("../src/runtime/healing-log.js");
const test_generator_js_1 = require("../src/runtime/test-generator.js");
(0, vitest_1.describe)('SelectorRegistry', () => {
    (0, vitest_1.it)('creates with initial selectors', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            input: { name: 'input', tiers: ['#input', '.input-field'] },
        });
        (0, vitest_1.expect)(registry.getSelector('input')).toEqual({
            name: 'input',
            tiers: ['#input', '.input-field'],
        });
        (0, vitest_1.expect)(registry.getVersion()).toBe(0);
    });
    (0, vitest_1.it)('returns undefined for unknown selectors', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({});
        (0, vitest_1.expect)(registry.getSelector('missing')).toBeUndefined();
    });
    (0, vitest_1.it)('hotPatch updates existing selector and increments version', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            btn: { name: 'btn', tiers: ['.old-btn'] },
        });
        registry.hotPatch('btn', ['.new-btn', '[role=button]']);
        (0, vitest_1.expect)(registry.getSelector('btn')).toEqual({
            name: 'btn',
            tiers: ['.new-btn', '[role=button]'],
        });
        (0, vitest_1.expect)(registry.getVersion()).toBe(1);
    });
    (0, vitest_1.it)('hotPatch creates new selector if not found', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({});
        registry.hotPatch('newSel', ['[data-testid=new]']);
        (0, vitest_1.expect)(registry.getSelector('newSel')).toEqual({
            name: 'newSel',
            tiers: ['[data-testid=new]'],
        });
        (0, vitest_1.expect)(registry.getVersion()).toBe(1);
    });
    (0, vitest_1.it)('increments version on each hotPatch', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            a: { name: 'a', tiers: ['#a'] },
        });
        registry.hotPatch('a', ['#a2']);
        registry.hotPatch('a', ['#a3']);
        registry.hotPatch('a', ['#a4']);
        (0, vitest_1.expect)(registry.getVersion()).toBe(3);
    });
    (0, vitest_1.it)('emits patched event on hotPatch', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            x: { name: 'x', tiers: ['.x'] },
        });
        const events = [];
        registry.on('patched', (data) => events.push(data));
        registry.hotPatch('x', ['.x2']);
        (0, vitest_1.expect)(events).toHaveLength(1);
        (0, vitest_1.expect)(events[0]).toEqual({
            name: 'x',
            newTiers: ['.x2'],
            version: 1,
        });
    });
    (0, vitest_1.it)('getAllSelectors returns all selectors', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            a: { name: 'a', tiers: ['#a'] },
            b: { name: 'b', tiers: ['#b'] },
        });
        const all = registry.getAllSelectors();
        (0, vitest_1.expect)(Object.keys(all)).toEqual(['a', 'b']);
    });
    (0, vitest_1.it)('toJSON returns serializable state', () => {
        const registry = new selector_registry_js_1.SelectorRegistry({
            a: { name: 'a', tiers: ['#a'] },
        });
        registry.hotPatch('a', ['#a2']);
        const json = registry.toJSON();
        (0, vitest_1.expect)(json.version).toBe(1);
        (0, vitest_1.expect)(json.selectors.a).toEqual({ name: 'a', tiers: ['#a2'] });
        (0, vitest_1.expect)(typeof json.lastUpdated).toBe('string');
    });
    (0, vitest_1.it)('does not mutate input selectors', () => {
        const input = { a: { name: 'a', tiers: ['#a'] } };
        const registry = new selector_registry_js_1.SelectorRegistry(input);
        registry.hotPatch('a', ['#a2']);
        // Original should be unchanged
        (0, vitest_1.expect)(input.a.tiers).toEqual(['#a']);
    });
});
(0, vitest_1.describe)('HealingLog', () => {
    let tmpDir;
    let logPath;
    (0, vitest_1.beforeEach)(() => {
        tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'healing-log-test-'));
        logPath = (0, node_path_1.join)(tmpDir, 'healing-log.jsonl');
    });
    (0, vitest_1.afterEach)(() => {
        (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('read returns empty array for non-existent file', () => {
        const log = new healing_log_js_1.HealingLog(logPath);
        (0, vitest_1.expect)(log.read()).toEqual([]);
    });
    (0, vitest_1.it)('append and read single entry', () => {
        const log = new healing_log_js_1.HealingLog(logPath);
        const entry = {
            timestamp: '2025-01-01T00:00:00.000Z',
            selectorName: 'btn',
            oldTiers: ['.old'],
            newTiers: ['.new'],
            error: 'not found',
            fixed: true,
            source: 'runtime',
        };
        log.append(entry);
        const entries = log.read();
        (0, vitest_1.expect)(entries).toHaveLength(1);
        (0, vitest_1.expect)(entries[0]).toEqual(entry);
    });
    (0, vitest_1.it)('append multiple entries', () => {
        const log = new healing_log_js_1.HealingLog(logPath);
        const entry1 = {
            timestamp: '2025-01-01T00:00:00.000Z',
            selectorName: 'btn1',
            oldTiers: ['.old1'],
            newTiers: ['.new1'],
            error: 'err1',
            fixed: true,
            source: 'runtime',
        };
        const entry2 = {
            timestamp: '2025-01-01T00:01:00.000Z',
            selectorName: 'btn2',
            oldTiers: ['.old2'],
            newTiers: ['.new2'],
            error: 'err2',
            fixed: false,
            source: 'heal-command',
        };
        log.append(entry1);
        log.append(entry2);
        const entries = log.read();
        (0, vitest_1.expect)(entries).toHaveLength(2);
        (0, vitest_1.expect)(entries[0].selectorName).toBe('btn1');
        (0, vitest_1.expect)(entries[1].selectorName).toBe('btn2');
    });
    (0, vitest_1.it)('clear truncates the log file', () => {
        const log = new healing_log_js_1.HealingLog(logPath);
        log.append({
            timestamp: '2025-01-01T00:00:00.000Z',
            selectorName: 'btn',
            oldTiers: ['.old'],
            newTiers: ['.new'],
            error: 'err',
            fixed: true,
            source: 'runtime',
        });
        (0, vitest_1.expect)(log.read()).toHaveLength(1);
        log.clear();
        (0, vitest_1.expect)(log.read()).toEqual([]);
    });
    (0, vitest_1.it)('stores as JSONL format', () => {
        const log = new healing_log_js_1.HealingLog(logPath);
        log.append({
            timestamp: 'ts1',
            selectorName: 'a',
            oldTiers: [],
            newTiers: [],
            error: 'e',
            fixed: true,
            source: 'runtime',
        });
        log.append({
            timestamp: 'ts2',
            selectorName: 'b',
            oldTiers: [],
            newTiers: [],
            error: 'e',
            fixed: false,
            source: 'heal-command',
        });
        const raw = (0, node_fs_1.readFileSync)(logPath, 'utf-8');
        const lines = raw.trim().split('\n');
        (0, vitest_1.expect)(lines).toHaveLength(2);
        // Each line should be valid JSON
        for (const line of lines) {
            (0, vitest_1.expect)(() => JSON.parse(line)).not.toThrow();
        }
    });
});
(0, vitest_1.describe)('TestCaseGenerator', () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(() => {
        tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'test-gen-test-'));
    });
    (0, vitest_1.afterEach)(() => {
        (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('getTestCases returns empty array when no cases exist', () => {
        const gen = new test_generator_js_1.TestCaseGenerator(tmpDir);
        (0, vitest_1.expect)(gen.getTestCases()).toEqual([]);
    });
    (0, vitest_1.it)('recordTestCase creates and stores a case', () => {
        const gen = new test_generator_js_1.TestCaseGenerator(tmpDir);
        gen.recordTestCase('typePrompt', { text: 'hello' }, ['promptInput']);
        const cases = gen.getTestCases();
        (0, vitest_1.expect)(cases).toHaveLength(1);
        (0, vitest_1.expect)(cases[0].action).toBe('typePrompt');
        (0, vitest_1.expect)(cases[0].input).toEqual({ text: 'hello' });
        (0, vitest_1.expect)(cases[0].expectedSelectorNames).toEqual(['promptInput']);
        (0, vitest_1.expect)(typeof cases[0].timestamp).toBe('string');
        (0, vitest_1.expect)(typeof cases[0].name).toBe('string');
    });
    (0, vitest_1.it)('recordTestCase appends multiple cases', () => {
        const gen = new test_generator_js_1.TestCaseGenerator(tmpDir);
        gen.recordTestCase('typePrompt', { text: 'a' }, ['promptInput']);
        gen.recordTestCase('submit', {}, ['submitButton']);
        gen.recordTestCase('extractResponse', {}, ['messageOutput']);
        const cases = gen.getTestCases();
        (0, vitest_1.expect)(cases).toHaveLength(3);
        (0, vitest_1.expect)(cases[0].action).toBe('typePrompt');
        (0, vitest_1.expect)(cases[1].action).toBe('submit');
        (0, vitest_1.expect)(cases[2].action).toBe('extractResponse');
    });
    (0, vitest_1.it)('stores cases in tests/regression/cases.json', () => {
        const gen = new test_generator_js_1.TestCaseGenerator(tmpDir);
        gen.recordTestCase('test', {}, []);
        const casesPath = (0, node_path_1.join)(tmpDir, 'tests', 'regression', 'cases.json');
        const raw = (0, node_fs_1.readFileSync)(casesPath, 'utf-8');
        const parsed = JSON.parse(raw);
        (0, vitest_1.expect)(Array.isArray(parsed)).toBe(true);
        (0, vitest_1.expect)(parsed).toHaveLength(1);
    });
});
//# sourceMappingURL=runtime.test.js.map