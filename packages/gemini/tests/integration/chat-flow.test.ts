/**
 * Integration test: Core Chat Flow (vertical slice).
 *
 * Tests the full cycle: new chat → type prompt → send → wait → extract.
 * Uses deterministic prompts to verify extraction.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { BrowserAdapter } from '../../src/browser/adapter.js';
import { UIStateMachine } from '../../src/state-machine/index.js';
import { createHash } from 'node:crypto';

let adapter: BrowserAdapter;

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Core Chat Flow', () => {
  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should complete a full chat round-trip', async () => {
    adapter = new BrowserAdapter();
    await adapter.connect();

    const sm = new UIStateMachine();
    const TEST_STRING = 'HELLO_WORLD_TEST_' + Date.now();

    // Step 1: Navigate to new chat
    console.log('Step 1: New chat');
    await adapter.newChat();
    sm.transition('IDLE', 'new-chat');
    expect(sm.state).toBe('IDLE');

    // Wait for page to settle
    await sleep(3000);

    // Step 2: Type prompt
    const prompt = `Reply with exactly this text and nothing else: ${TEST_STRING}`;
    console.log('Step 2: Type prompt -', prompt.slice(0, 60));
    await adapter.typePrompt(prompt);
    sm.transition('TYPING', 'type-prompt');
    expect(sm.state).toBe('TYPING');

    // Step 3: Submit
    await sleep(500);
    console.log('Step 3: Submit');
    await adapter.submit();
    sm.transition('GENERATING', 'submit');
    expect(sm.state).toBe('GENERATING');

    // Step 4: Poll for response
    console.log('Step 4: Polling for response...');
    const maxWait = 60_000;
    const startTime = Date.now();
    let lastHash = '';
    let stableCount = 0;
    let responseText = '';

    // Initial wait for generation to start
    await sleep(3000);

    while (Date.now() - startTime < maxWait) {
      const generating = await adapter.isGenerating();
      const complete = await adapter.isResponseComplete();

      console.log(`  Poll: generating=${generating}, complete=${complete}, elapsed=${Date.now() - startTime}ms`);

      if (!generating) {
        try {
          const text = await adapter.extractResponse();
          if (text.length > 0) {
            const hash = hashText(text);
            if (hash === lastHash) {
              stableCount++;
              if (stableCount >= 3) {
                responseText = text;
                break;
              }
            } else {
              stableCount = 1;
              lastHash = hash;
              responseText = text;
            }
          }
        } catch {
          // Response not yet available
        }
      }

      await sleep(1000);
    }

    sm.transition('DONE', 'response-stable');
    expect(sm.state).toBe('DONE');

    // Step 5: Verify response
    console.log('Response text (first 200 chars):', responseText.slice(0, 200));
    console.log('Response length:', responseText.length);
    expect(responseText.length).toBeGreaterThan(0);
    expect(responseText).toContain(TEST_STRING);

    console.log('Full chat flow PASSED!');
    console.log('Timeline:', JSON.stringify(sm.timeline, null, 2));
  }, 90_000); // 90 second timeout for this test
});
