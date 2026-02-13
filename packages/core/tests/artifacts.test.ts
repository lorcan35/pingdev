import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactLogger } from '../src/artifacts/index.js';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_DIR = '/tmp/pingdev-test-artifacts';

describe('ArtifactLogger', () => {
  let logger: ArtifactLogger;

  beforeEach(async () => {
    logger = new ArtifactLogger('test-job-123', TEST_DIR);
    await logger.init();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('creates artifact directory', () => {
    expect(logger.dir).toBe(join(TEST_DIR, 'test-job-123'));
  });

  it('saves request JSON', async () => {
    await logger.saveRequest({ prompt: 'Hello world' });
    const content = await readFile(join(logger.dir, 'request.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.prompt).toBe('Hello world');
  });

  it('appends timeline entries', async () => {
    await logger.appendTimeline({
      timestamp: '2025-01-01T00:00:00Z',
      from: 'IDLE',
      to: 'TYPING',
      trigger: 'test',
    });
    await logger.appendTimeline({
      timestamp: '2025-01-01T00:00:01Z',
      from: 'TYPING',
      to: 'GENERATING',
      trigger: 'submit',
    });
    const content = await readFile(join(logger.dir, 'timeline.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('saves response text', async () => {
    await logger.saveResponse('This is the response');
    const content = await readFile(join(logger.dir, 'response.md'), 'utf-8');
    expect(content).toBe('This is the response');
  });

  it('saves errors', async () => {
    await logger.saveErrors([{
      code: 'UNKNOWN',
      message: 'Test error',
      retryable: false,
    }]);
    const content = await readFile(join(logger.dir, 'errors.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe('UNKNOWN');
  });
});
