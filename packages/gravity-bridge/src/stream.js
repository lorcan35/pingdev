import { v4 as uuidv4 } from 'uuid';

// ── Selectors ──────────────────────────────────────────────────────────
const BOT_MSG_CLASS = 'text-ide-message-block-bot-color';
const BOT_MSG_SEL = `.${BOT_MSG_CLASS}`;

// ── Helpers ────────────────────────────────────────────────────────────

function genId() {
  return `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
}

function log(...args) {
  console.log('[stream]', ...args);
}

// ── SSE / Completion formatting ────────────────────────────────────────

/**
 * Format a single token into an OpenAI-compatible SSE chunk.
 *
 * When `isLast` is true, emits a delta with empty content and
 * finish_reason "stop", followed by `data: [DONE]`.
 */
function formatSSEChunk(content, model, id, isLast = false) {
  if (isLast) {
    const stopChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content: '' },
          finish_reason: 'stop',
        },
      ],
    };
    return `data: ${JSON.stringify(stopChunk)}\n\ndata: [DONE]\n\n`;
  }

  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Format a full response as an OpenAI-compatible completion object.
 * Optionally includes thinking content in the response.
 */
function formatCompletionResponse(content, model, id, thinking = null) {
  const message = {
    role: 'assistant',
    content,
  };

  // Include thinking as a separate field (Anthropic-style)
  if (thinking) {
    message.thinking = thinking;
  }

  return {
    id: id || genId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// Keep backward-compatible alias used by api.js
function formatCompletion(content, model) {
  return formatCompletionResponse(content, model);
}

// ── Stream handler (SSE response writer) ───────────────────────────────

/**
 * Create a streaming response handler that writes SSE events to an
 * Express response object.  Returns { onToken, finish, abort, id }.
 */
function createStreamHandler(res, model) {
  const id = genId();

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial role chunk
  const roleChunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null,
      },
    ],
  };
  res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

  const onToken = (delta) => {
    if (delta) {
      // Use the internal format — non-last chunk with finishReason null
      const chunk = {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          { index: 0, delta: { content: delta }, finish_reason: null },
        ],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  };

  const finish = () => {
    const stopChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        { index: 0, delta: {}, finish_reason: 'stop' },
      ],
    };
    res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const abort = (error) => {
    const errChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content: `\n\n[Error: ${error}]` },
          finish_reason: 'stop',
        },
      ],
    };
    res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  };

  return { onToken, finish, abort, id };
}

// ── MutationObserver-based real-time streaming ─────────────────────────

/**
 * Stream response tokens in real-time via a MutationObserver injected
 * into the Antigravity IDE page through CDP.
 *
 * @param {import('puppeteer-core').Page} page  - Puppeteer page handle
 * @param {(text: string) => void} onToken      - Receives incremental text deltas
 * @param {(result: {content: string, thinking: string|null}) => void} onDone - Called when response is complete
 * @param {object} [options]
 * @param {number} [options.timeout=120000]      - Max wait time in ms
 * @returns {() => void} cancel — call to abort early and clean up
 */
function streamResponse(page, onToken, onDone, options = {}) {
  const timeout = options.timeout ?? 120000;
  let cancelled = false;
  let settled = false;

  const bridgeToken = `__gbOnToken_${Date.now()}`;
  const bridgeDone = `__gbOnDone_${Date.now()}`;

  const run = async () => {
    // Expose Node-side callbacks into the browser context
    await page.exposeFunction(bridgeToken, (delta) => {
      if (!cancelled && !settled) {
        onToken(delta);
      }
    });

    await page.exposeFunction(bridgeDone, (resultJson) => {
      if (!settled) {
        settled = true;
        const result = JSON.parse(resultJson);
        log('Response complete —', result.content.length, 'chars',
            result.thinking ? `+ ${result.thinking.length} thinking chars` : '');
        onDone(result);
      }
    });

    log('Injecting MutationObserver (timeout:', timeout, 'ms)');

    // Inject the observer into the page
    await page.evaluate(
      (botMsgSel, tokenFn, doneFn, timeoutMs) => {
        // ── helpers inside browser context ──────────────────────────
        const THOUGHT_PREFIX_RE = /^Thought for\s+\d+s?\s*/i;

        function getTargetElement() {
          const blocks = document.querySelectorAll(botMsgSel);
          return blocks.length > 0 ? blocks[blocks.length - 1] : null;
        }

        /**
         * Extract content and thinking separately from a bot message block.
         * Returns { content, thinking }.
         */
        function extractParts(target) {
          let thinking = null;
          let contentParts = [];

          // Walk children to separate thinking blocks from content
          const children = target.children;
          for (const child of children) {
            const text = child.innerText?.trim() || '';
            if (THOUGHT_PREFIX_RE.test(text)) {
              // This is a thinking block — extract just the thinking content
              const thinkingText = text.replace(THOUGHT_PREFIX_RE, '').trim();
              if (thinkingText) thinking = thinkingText;
            } else if (text.length > 0) {
              contentParts.push(text);
            }
          }

          // Fallback: if no structured children, use full innerText
          if (contentParts.length === 0) {
            const raw = target.innerText || '';
            const cleaned = raw.replace(THOUGHT_PREFIX_RE, '').trim();
            contentParts.push(cleaned);
          }

          return {
            content: contentParts.join('\n').trim(),
            thinking,
          };
        }

        /**
         * Get clean content text (without thinking) for streaming deltas.
         */
        function getContentText(target) {
          return extractParts(target).content;
        }

        // ── state ──────────────────────────────────────────────────
        let emittedLen = 0;
        let debounceTimer = null;
        let observer = null;
        let watcherObserver = null;
        const DONE_DEBOUNCE_MS = 3000;

        function emitDelta(target) {
          const cleaned = getContentText(target);
          if (cleaned.length > emittedLen) {
            const delta = cleaned.slice(emittedLen);
            emittedLen = cleaned.length;
            window[tokenFn](delta);
          }

          // Reset the done-debounce timer on every mutation
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // No mutations for DONE_DEBOUNCE_MS — treat as complete
            cleanup();
            const finalTarget = getTargetElement();
            const result = finalTarget ? extractParts(finalTarget) : { content: '', thinking: null };
            window[doneFn](JSON.stringify(result));
          }, DONE_DEBOUNCE_MS);
        }

        function observeTarget(target) {
          if (observer) observer.disconnect();

          observer = new MutationObserver(() => {
            emitDelta(target);
          });

          observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
          });

          // Emit any content already present
          emitDelta(target);
        }

        function cleanup() {
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          if (watcherObserver) {
            watcherObserver.disconnect();
            watcherObserver = null;
          }
          clearTimeout(debounceTimer);
          clearTimeout(timeoutTimer);
        }

        // ── bootstrap ──────────────────────────────────────────────
        const existing = getTargetElement();
        const initialCount = document.querySelectorAll(botMsgSel).length;

        const conversationEl =
          document.getElementById('conversation') || document.body;

        watcherObserver = new MutationObserver(() => {
          const blocks = document.querySelectorAll(botMsgSel);
          if (blocks.length > initialCount) {
            const newTarget = blocks[blocks.length - 1];
            if (watcherObserver) {
              watcherObserver.disconnect();
              watcherObserver = null;
            }
            observeTarget(newTarget);
          }
        });

        watcherObserver.observe(conversationEl, {
          childList: true,
          subtree: true,
        });

        if (existing) {
          const currentText = getContentText(existing);
          if (currentText.length === 0) {
            observeTarget(existing);
          }
        }

        // ── timeout guard ──────────────────────────────────────────
        const timeoutTimer = setTimeout(() => {
          cleanup();
          const target = getTargetElement();
          const result = target ? extractParts(target) : { content: '', thinking: null };
          window[doneFn](JSON.stringify(result));
        }, timeoutMs);

        window.__gbCleanup = cleanup;
      },
      BOT_MSG_SEL,
      bridgeToken,
      bridgeDone,
      timeout
    );
  };

  // Fire-and-forget the async setup; errors go to console
  run().catch((err) => {
    log('Error setting up stream observer:', err.message);
    if (!settled) {
      settled = true;
      onDone({ content: '', thinking: null });
    }
  });

  // Return a cancel function
  return () => {
    if (cancelled) return;
    cancelled = true;
    settled = true;
    log('Stream cancelled');
    page
      .evaluate(() => {
        if (typeof window.__gbCleanup === 'function') {
          window.__gbCleanup();
        }
      })
      .catch(() => {});
  };
}

// ── Wait for a new assistant message ───────────────────────────────────

/**
 * Wait for a NEW assistant message element to appear in the conversation
 * after a prompt has been sent.
 *
 * @param {import('puppeteer-core').Page} page
 * @param {number} [timeout=10000]
 * @returns {Promise<void>}
 */
async function waitForNewMessage(page, timeout = 10000) {
  log('Waiting for new assistant message (timeout:', timeout, 'ms)');

  await page.evaluate(
    (botMsgSel, timeoutMs) => {
      return new Promise((resolve, reject) => {
        const initialCount = document.querySelectorAll(botMsgSel).length;

        // Maybe one appeared already between sending and calling this
        // (race-safe check)
        if (document.querySelectorAll(botMsgSel).length > initialCount) {
          return resolve();
        }

        const conversationEl =
          document.getElementById('conversation') || document.body;

        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timed out waiting for new assistant message'));
        }, timeoutMs);

        const observer = new MutationObserver(() => {
          if (document.querySelectorAll(botMsgSel).length > initialCount) {
            observer.disconnect();
            clearTimeout(timer);
            resolve();
          }
        });

        observer.observe(conversationEl, {
          childList: true,
          subtree: true,
        });
      });
    },
    BOT_MSG_SEL,
    timeout
  );

  log('New assistant message detected');
}

// ── Simple non-streaming extraction ────────────────────────────────────

/**
 * Extract the text content of the last assistant message block.
 * Strips any "Thought for ..." prefix.
 *
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<string>}
 */
async function extractLastResponse(page) {
  const text = await page.evaluate((botMsgSel) => {
    const blocks = document.querySelectorAll(botMsgSel);
    if (blocks.length === 0) return '';

    const last = blocks[blocks.length - 1];
    return last.innerText || '';
  }, BOT_MSG_SEL);

  // Strip "Thought for Xs" prefix
  return text.replace(/^Thought for\s+<?\d+s>?\s*/i, '').trim();
}

// ── Exports ────────────────────────────────────────────────────────────

export {
  streamResponse,
  waitForNewMessage,
  extractLastResponse,
  formatSSEChunk,
  formatCompletionResponse,
  // Backward-compatible aliases used by api.js
  formatCompletion,
  createStreamHandler,
};
