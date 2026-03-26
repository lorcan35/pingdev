/**
 * Unit tests for idempotency module — hash/key logic and Redis dedup.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { IdempotencyStore } from '@pingdev/core';
import type { EnhancedJobResult } from '@pingdev/core';

const store = new IdempotencyStore(
  { host: '127.0.0.1', port: 6379 },
  { ttlMs: 3_600_000, keyPrefix: 'idemp' },
);

describe('Idempotency — normalizePrompt', () => {
  it('should trim leading/trailing whitespace', () => {
    expect(IdempotencyStore.normalizePrompt('  hello world  ')).toBe('hello world');
  });

  it('should collapse internal whitespace', () => {
    expect(IdempotencyStore.normalizePrompt('hello   world')).toBe('hello world');
  });

  it('should handle tabs and newlines', () => {
    expect(IdempotencyStore.normalizePrompt('hello\t\nworld')).toBe('hello world');
  });

  it('should preserve single spaces', () => {
    expect(IdempotencyStore.normalizePrompt('hello world')).toBe('hello world');
  });
});

describe('Idempotency — buildKey', () => {
  it('should produce deterministic keys', () => {
    const k1 = store.buildKey('key1', 'hello world');
    const k2 = store.buildKey('key1', 'hello world');
    expect(k1).toBe(k2);
  });

  it('should produce different keys for different prompts', () => {
    const k1 = store.buildKey('key1', 'hello');
    const k2 = store.buildKey('key1', 'world');
    expect(k1).not.toBe(k2);
  });

  it('should produce different keys for different idempotency keys', () => {
    const k1 = store.buildKey('key1', 'hello');
    const k2 = store.buildKey('key2', 'hello');
    expect(k1).not.toBe(k2);
  });

  it('should normalize prompts before hashing', () => {
    const k1 = store.buildKey('key1', '  hello   world  ');
    const k2 = store.buildKey('key1', 'hello world');
    expect(k1).toBe(k2);
  });

  it('should contain the key prefix and idempotency key', () => {
    const key = store.buildKey('my-key', 'test');
    expect(key).toMatch(/^idemp:my-key:/);
  });
});

describe('Idempotency — Redis operations', () => {
  const testKey = 'test-idemp-' + Date.now();
  const testPrompt = 'test prompt ' + Date.now();

  afterAll(async () => {
    await store.close();
  });

  it('should return null for unknown keys', async () => {
    const result = await store.check('nonexistent-key', 'nonexistent prompt');
    expect(result).toBeNull();
  });

  it('should store and retrieve pending entry', async () => {
    await store.storePending(testKey, testPrompt, 'job-123');

    const entry = await store.check(testKey, testPrompt);
    expect(entry).not.toBeNull();
    expect(entry!.job_id).toBe('job-123');
    expect(entry!.status).toBe('pending');
    expect(entry!.result).toBeUndefined();
  });

  it('should store and retrieve terminal result', async () => {
    const result: EnhancedJobResult = {
      job_id: 'job-123',
      status: 'done',
      created_at: new Date().toISOString(),
      prompt: testPrompt,
      response: 'Test response',
    };

    await store.storeResult(testKey, testPrompt, result);

    const entry = await store.check(testKey, testPrompt);
    expect(entry).not.toBeNull();
    expect(entry!.job_id).toBe('job-123');
    expect(entry!.status).toBe('done');
    expect(entry!.result).toBeDefined();
    expect(entry!.result!.response).toBe('Test response');
  });

  it('should not match different prompts with same key', async () => {
    await store.storePending(testKey, 'different prompt', 'job-456');

    // Original prompt should still return the terminal result (not the new pending)
    const entry = await store.check(testKey, testPrompt);
    expect(entry).not.toBeNull();
    expect(entry!.job_id).toBe('job-123');
    expect(entry!.status).toBe('done');
  });
});
