import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SelectorRegistry } from '../src/runtime/selector-registry.js';
import { HealingLog } from '../src/runtime/healing-log.js';
import { TestCaseGenerator } from '../src/runtime/test-generator.js';
import type { HealingLogEntry } from '../src/runtime/types.js';

describe('SelectorRegistry', () => {
  it('creates with initial selectors', () => {
    const registry = new SelectorRegistry({
      input: { name: 'input', tiers: ['#input', '.input-field'] },
    });
    expect(registry.getSelector('input')).toEqual({
      name: 'input',
      tiers: ['#input', '.input-field'],
    });
    expect(registry.getVersion()).toBe(0);
  });

  it('returns undefined for unknown selectors', () => {
    const registry = new SelectorRegistry({});
    expect(registry.getSelector('missing')).toBeUndefined();
  });

  it('hotPatch updates existing selector and increments version', () => {
    const registry = new SelectorRegistry({
      btn: { name: 'btn', tiers: ['.old-btn'] },
    });

    registry.hotPatch('btn', ['.new-btn', '[role=button]']);

    expect(registry.getSelector('btn')).toEqual({
      name: 'btn',
      tiers: ['.new-btn', '[role=button]'],
    });
    expect(registry.getVersion()).toBe(1);
  });

  it('hotPatch creates new selector if not found', () => {
    const registry = new SelectorRegistry({});

    registry.hotPatch('newSel', ['[data-testid=new]']);

    expect(registry.getSelector('newSel')).toEqual({
      name: 'newSel',
      tiers: ['[data-testid=new]'],
    });
    expect(registry.getVersion()).toBe(1);
  });

  it('increments version on each hotPatch', () => {
    const registry = new SelectorRegistry({
      a: { name: 'a', tiers: ['#a'] },
    });

    registry.hotPatch('a', ['#a2']);
    registry.hotPatch('a', ['#a3']);
    registry.hotPatch('a', ['#a4']);

    expect(registry.getVersion()).toBe(3);
  });

  it('emits patched event on hotPatch', () => {
    const registry = new SelectorRegistry({
      x: { name: 'x', tiers: ['.x'] },
    });

    const events: unknown[] = [];
    registry.on('patched', (data) => events.push(data));

    registry.hotPatch('x', ['.x2']);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      name: 'x',
      newTiers: ['.x2'],
      version: 1,
    });
  });

  it('getAllSelectors returns all selectors', () => {
    const registry = new SelectorRegistry({
      a: { name: 'a', tiers: ['#a'] },
      b: { name: 'b', tiers: ['#b'] },
    });

    const all = registry.getAllSelectors();
    expect(Object.keys(all)).toEqual(['a', 'b']);
  });

  it('toJSON returns serializable state', () => {
    const registry = new SelectorRegistry({
      a: { name: 'a', tiers: ['#a'] },
    });

    registry.hotPatch('a', ['#a2']);
    const json = registry.toJSON();

    expect(json.version).toBe(1);
    expect(json.selectors.a).toEqual({ name: 'a', tiers: ['#a2'] });
    expect(typeof json.lastUpdated).toBe('string');
  });

  it('does not mutate input selectors', () => {
    const input = { a: { name: 'a', tiers: ['#a'] } };
    const registry = new SelectorRegistry(input);

    registry.hotPatch('a', ['#a2']);

    // Original should be unchanged
    expect(input.a.tiers).toEqual(['#a']);
  });
});

describe('HealingLog', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'healing-log-test-'));
    logPath = join(tmpDir, 'healing-log.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('read returns empty array for non-existent file', () => {
    const log = new HealingLog(logPath);
    expect(log.read()).toEqual([]);
  });

  it('append and read single entry', () => {
    const log = new HealingLog(logPath);

    const entry: HealingLogEntry = {
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

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(entry);
  });

  it('append multiple entries', () => {
    const log = new HealingLog(logPath);

    const entry1: HealingLogEntry = {
      timestamp: '2025-01-01T00:00:00.000Z',
      selectorName: 'btn1',
      oldTiers: ['.old1'],
      newTiers: ['.new1'],
      error: 'err1',
      fixed: true,
      source: 'runtime',
    };

    const entry2: HealingLogEntry = {
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
    expect(entries).toHaveLength(2);
    expect(entries[0]!.selectorName).toBe('btn1');
    expect(entries[1]!.selectorName).toBe('btn2');
  });

  it('clear truncates the log file', () => {
    const log = new HealingLog(logPath);

    log.append({
      timestamp: '2025-01-01T00:00:00.000Z',
      selectorName: 'btn',
      oldTiers: ['.old'],
      newTiers: ['.new'],
      error: 'err',
      fixed: true,
      source: 'runtime',
    });

    expect(log.read()).toHaveLength(1);

    log.clear();
    expect(log.read()).toEqual([]);
  });

  it('stores as JSONL format', () => {
    const log = new HealingLog(logPath);

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

    const raw = readFileSync(logPath, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);

    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('TestCaseGenerator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'test-gen-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getTestCases returns empty array when no cases exist', () => {
    const gen = new TestCaseGenerator(tmpDir);
    expect(gen.getTestCases()).toEqual([]);
  });

  it('recordTestCase creates and stores a case', () => {
    const gen = new TestCaseGenerator(tmpDir);

    gen.recordTestCase('typePrompt', { text: 'hello' }, ['promptInput']);

    const cases = gen.getTestCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.action).toBe('typePrompt');
    expect(cases[0]!.input).toEqual({ text: 'hello' });
    expect(cases[0]!.expectedSelectorNames).toEqual(['promptInput']);
    expect(typeof cases[0]!.timestamp).toBe('string');
    expect(typeof cases[0]!.name).toBe('string');
  });

  it('recordTestCase appends multiple cases', () => {
    const gen = new TestCaseGenerator(tmpDir);

    gen.recordTestCase('typePrompt', { text: 'a' }, ['promptInput']);
    gen.recordTestCase('submit', {}, ['submitButton']);
    gen.recordTestCase('extractResponse', {}, ['messageOutput']);

    const cases = gen.getTestCases();
    expect(cases).toHaveLength(3);
    expect(cases[0]!.action).toBe('typePrompt');
    expect(cases[1]!.action).toBe('submit');
    expect(cases[2]!.action).toBe('extractResponse');
  });

  it('stores cases in tests/regression/cases.json', () => {
    const gen = new TestCaseGenerator(tmpDir);

    gen.recordTestCase('test', {}, []);

    const casesPath = join(tmpDir, 'tests', 'regression', 'cases.json');
    const raw = readFileSync(casesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });
});
