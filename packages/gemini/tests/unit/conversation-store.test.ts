/**
 * Unit tests for conversation store — Redis-backed conversation continuity.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { ConversationStore } from '@pingdev/core';

const store = new ConversationStore(
  { host: '127.0.0.1', port: 6379 },
  { ttlMs: 1_800_000, keyPrefix: 'test-convo' },
);

describe('Conversation Store', () => {
  afterAll(async () => {
    await store.close();
  });

  it('should return null for unknown conversation_id', async () => {
    const result = await store.get('nonexistent-convo-id');
    expect(result).toBeNull();
  });

  it('should store and retrieve a conversation', async () => {
    const url = 'https://gemini.google.com/u/1/app/abc123';
    const id = await store.store(url);

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    const entry = await store.get(id);
    expect(entry).not.toBeNull();
    expect(entry!.url).toBe(url);
    expect(entry!.conversation_id).toBe(id);
    expect(entry!.created_at).toBeTruthy();
    expect(entry!.last_used).toBeTruthy();
  });

  it('should allow specifying a custom conversation_id', async () => {
    const url = 'https://gemini.google.com/u/1/app/custom123';
    const id = await store.store(url, 'my-custom-id');

    expect(id).toBe('my-custom-id');

    const entry = await store.get('my-custom-id');
    expect(entry).not.toBeNull();
    expect(entry!.url).toBe(url);
  });

  it('should update last_used on retrieval (sliding TTL)', async () => {
    const url = 'https://gemini.google.com/u/1/app/ttltest';
    const id = await store.store(url);

    const entry1 = await store.get(id);
    expect(entry1).not.toBeNull();
    const firstUsed = entry1!.last_used;

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 50));

    const entry2 = await store.get(id);
    expect(entry2).not.toBeNull();
    expect(entry2!.last_used).not.toBe(firstUsed);
  });

  it('should overwrite conversation with same id', async () => {
    const id = 'overwrite-test';
    await store.store('https://gemini.google.com/u/1/app/old', id);
    await store.store('https://gemini.google.com/u/1/app/new', id);

    const entry = await store.get(id);
    expect(entry).not.toBeNull();
    expect(entry!.url).toBe('https://gemini.google.com/u/1/app/new');
  });
});
