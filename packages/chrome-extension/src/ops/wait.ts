// wait — Smart Conditional Waits
import type { BridgeResponse } from '../types';
import { findElement, isVisible, sleep } from './helpers';

type WaitCondition = 'visible' | 'hidden' | 'text' | 'textChange' | 'networkIdle' | 'domStable' | 'exists';

interface WaitCommand {
  condition: WaitCondition;
  selector?: string;
  text?: string;
  timeout?: number;
}

const MAX_TIMEOUT = 30_000;
const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 100;

export async function handleWait(command: WaitCommand): Promise<BridgeResponse> {
  const { condition, selector, text } = command;
  const timeout = Math.min(command.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

  if (!condition) {
    return { success: false, error: 'Missing condition' };
  }

  const start = Date.now();

  try {
    const met = await waitForCondition(condition, selector, text, timeout);
    const duration_ms = Date.now() - start;
    return { success: true, data: { waited: true, duration_ms, condition_met: met } };
  } catch (err) {
    const duration_ms = Date.now() - start;
    return {
      success: true,
      data: {
        waited: true,
        duration_ms,
        condition_met: false,
        error: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function waitForCondition(
  condition: WaitCondition,
  selector?: string,
  text?: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<boolean> {
  switch (condition) {
    case 'visible':
      return waitVisible(selector!, timeout);
    case 'hidden':
      return waitHidden(selector!, timeout);
    case 'text':
      return waitText(selector!, text!, timeout);
    case 'textChange':
      return waitTextChange(selector!, timeout);
    case 'networkIdle':
      return waitNetworkIdle(timeout);
    case 'domStable':
      return waitDomStable(timeout);
    case 'exists':
      return waitExists(selector!, timeout);
    default:
      throw new Error(`Unknown wait condition: ${condition}`);
  }
}

async function waitVisible(selector: string, timeout: number): Promise<boolean> {
  if (!selector) throw new Error('selector required for visible condition');
  return poll(() => {
    const el = findElement(selector);
    return el !== null && isVisible(el);
  }, timeout);
}

async function waitHidden(selector: string, timeout: number): Promise<boolean> {
  if (!selector) throw new Error('selector required for hidden condition');
  return poll(() => {
    const el = findElement(selector);
    return el === null || !isVisible(el);
  }, timeout);
}

async function waitText(selector: string, text: string, timeout: number): Promise<boolean> {
  if (!selector) throw new Error('selector required for text condition');
  if (!text) throw new Error('text required for text condition');
  const lowerText = text.toLowerCase();
  return poll(() => {
    const el = findElement(selector);
    if (!el) return false;
    const content = el.textContent?.trim().toLowerCase() || '';
    return content.includes(lowerText);
  }, timeout);
}

async function waitTextChange(selector: string, timeout: number): Promise<boolean> {
  if (!selector) throw new Error('selector required for textChange condition');
  const el = findElement(selector);
  const initialText = el?.textContent?.trim() || '';

  return poll(() => {
    const current = findElement(selector);
    const currentText = current?.textContent?.trim() || '';
    return currentText !== initialText;
  }, timeout);
}

async function waitNetworkIdle(timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    let pending = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const idleThreshold = 2000;
    const startTime = Date.now();

    const origFetch = window.fetch;
    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;

    function checkIdle() {
      if (pending === 0) {
        if (!idleTimer) {
          idleTimer = setTimeout(() => {
            cleanup();
            resolve(true);
          }, idleThreshold);
        }
      } else if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }

    function cleanup() {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXHROpen;
      XMLHttpRequest.prototype.send = origXHRSend;
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutId) clearTimeout(timeoutId);
    }

    // Intercept fetch
    window.fetch = function (...args: Parameters<typeof fetch>) {
      pending++;
      checkIdle();
      return origFetch.apply(this, args).finally(() => {
        pending--;
        checkIdle();
      });
    };

    // Intercept XHR
    XMLHttpRequest.prototype.send = function (...args: [body?: Document | XMLHttpRequestBodyInit | null]) {
      pending++;
      checkIdle();
      this.addEventListener('loadend', () => {
        pending--;
        checkIdle();
      }, { once: true });
      return origXHRSend.apply(this, args);
    };

    // Timeout
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);

    // Start checking immediately
    checkIdle();
  });
}

async function waitDomStable(timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    let mutationTimer: ReturnType<typeof setTimeout> | null = null;
    const stableThreshold = 1000;

    const observer = new MutationObserver(() => {
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        observer.disconnect();
        resolve(true);
      }, stableThreshold);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    // Start the timer in case DOM is already stable
    mutationTimer = setTimeout(() => {
      observer.disconnect();
      resolve(true);
    }, stableThreshold);

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      if (mutationTimer) clearTimeout(mutationTimer);
      resolve(false);
    }, timeout);
  });
}

async function waitExists(selector: string, timeout: number): Promise<boolean> {
  if (!selector) throw new Error('selector required for exists condition');
  return poll(() => {
    const el = findElement(selector);
    return el !== null;
  }, timeout);
}

async function poll(check: () => boolean, timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return true;
    await sleep(POLL_INTERVAL);
  }
  return false;
}
