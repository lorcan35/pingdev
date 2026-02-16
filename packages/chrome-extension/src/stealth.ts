// Stealth utilities for human-like automation

/** Random number between min and max (inclusive) */
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Random integer between min and max (inclusive) */
function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Get element bounding rect with fallback */
function getRect(el: Element): DOMRect | null {
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

// ============================================================================
// Anti-Fingerprinting
// ============================================================================

/**
 * Returns anti-fingerprinting code to inject into page context (world: MAIN).
 * This must run at document_start before page scripts load.
 */
export function getAntiFingerprintCode(): string {
  return `
(function() {
  'use strict';
  
  // Hide webdriver flag
  try {
    Object.defineProperty(navigator, 'webdriver', { 
      get: () => false,
      configurable: true
    });
  } catch {}

  // Realistic plugins array (Chrome normally has 3-5)
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        return Object.setPrototypeOf(plugins, PluginArray.prototype);
      },
      configurable: true
    });
  } catch {}

  // Realistic languages
  try {
    Object.defineProperty(navigator, 'languages', { 
      get: () => ['en-US', 'en', 'ar'],
      configurable: true
    });
  } catch {}

  // Hide Chrome DevTools Protocol automation properties
  const cdcProps = [
    'cdc_adoQpoasnfa76pfcZLmcfl_Array',
    'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol',
    '__webdriver_script_fn',
    '__driver_evaluate',
    '__webdriver_evaluate',
    '__selenium_evaluate',
    '__fxdriver_evaluate',
    '__driver_unwrapped',
    '__webdriver_unwrapped',
    '__selenium_unwrapped',
    '__fxdriver_unwrapped',
    '_Selenium_IDE_Recorder',
    '_selenium',
    'calledSelenium',
    '$cdc_asdjflasutopfhvcZLmcfl_',
    '$chrome_asyncScriptInfo',
    '__$webdriverAsyncExecutor'
  ];

  for (const prop of cdcProps) {
    try {
      delete window[prop];
    } catch {}
  }

  // Prevent re-definition of webdriver
  try {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', {
      get: () => false,
      configurable: true
    });
  } catch {}
})();
`.trim();
}

// ============================================================================
// Human-like Mouse Movement
// ============================================================================

interface Point {
  x: number;
  y: number;
}

/**
 * Generates points along a quadratic Bezier curve from start to end
 * with a randomized control point for natural movement.
 */
function bezierCurve(start: Point, end: Point, steps: number): Point[] {
  const points: Point[] = [];
  
  // Random control point (offset from midpoint)
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const offsetX = random(-50, 50);
  const offsetY = random(-50, 50);
  const control: Point = { x: midX + offsetX, y: midY + offsetY };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t1 = 1 - t;
    
    // Quadratic Bezier formula
    const x = t1 * t1 * start.x + 2 * t1 * t * control.x + t * t * end.x;
    const y = t1 * t1 * start.y + 2 * t1 * t * control.y + t * t * end.y;
    
    points.push({ x, y });
  }

  return points;
}

/**
 * Dispatches mouse events along a curved path to the element
 * with human-like timing and randomness.
 */
export async function moveMouseToElement(element: Element): Promise<void> {
  const rect = getRect(element);
  if (!rect) return;

  // Random target position within element bounds (not always dead center)
  const targetX = rect.left + rect.width * random(0.3, 0.7);
  const targetY = rect.top + rect.height * random(0.3, 0.7);

  // Current mouse position (approximate - we'll start from viewport center if unknown)
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight / 2;

  const start: Point = { x: startX, y: startY };
  const end: Point = { x: targetX, y: targetY };
  
  const steps = randomInt(8, 15);
  const points = bezierCurve(start, end, steps);
  const totalDuration = randomInt(200, 500);
  const delayPerStep = totalDuration / steps;

  // Dispatch mousemove events along the curve
  for (const point of points) {
    const event = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
    });
    document.dispatchEvent(event);
    await sleep(delayPerStep);
  }
}

/**
 * Human-like click with realistic event sequence and timing.
 */
export async function humanClick(element: Element): Promise<void> {
  // Move mouse to element first
  await moveMouseToElement(element);

  const rect = getRect(element);
  if (!rect) {
    throw new Error('Cannot get element bounds for click');
  }

  // Random click position within element
  const clickX = rect.left + rect.width * random(0.3, 0.7);
  const clickY = rect.top + rect.height * random(0.3, 0.7);

  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: clickX,
    clientY: clickY,
  };

  // Realistic event sequence
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  await sleep(randomInt(10, 30));
  
  element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
  await sleep(randomInt(10, 30));
  
  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  await sleep(randomInt(50, 150)); // Human delay between mousedown and mouseup
  
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  await sleep(randomInt(5, 15));
  
  element.dispatchEvent(new MouseEvent('click', eventOptions));
}

// ============================================================================
// Human-like Typing
// ============================================================================

/**
 * Dispatches keyboard events for a single character with realistic timing.
 */
async function typeChar(element: HTMLElement, char: string): Promise<void> {
  const keyOptions = {
    bubbles: true,
    cancelable: true,
    key: char,
    char: char,
    code: `Key${char.toUpperCase()}`,
  };

  // For contenteditable, execCommand already emits the needed editing behavior.
  if (element.isContentEditable) {
    document.execCommand('insertText', false, char);
    return;
  }

  element.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
  await sleep(randomInt(5, 15));

  // Update value if input/textarea using native setter (React-friendly)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const currentValue = element.value ?? '';
    const valueProto = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(valueProto, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(element, currentValue + char);
    } else {
      element.setAttribute('value', currentValue + char);
    }

    // Modern listeners rely on InputEvent payload; React also catches input events.
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: char,
      inputType: 'insertText',
    }));

    element.dispatchEvent(new Event('input', {
      bubbles: true,
      cancelable: true,
    }));
  }

  element.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
}

/**
 * Types text into an element with human-like delays and occasional pauses.
 */
export async function humanType(element: HTMLElement, text: string, options: { humanize?: boolean } = {}): Promise<void> {
  // Initial delay (simulating moving to field and thinking)
  await sleep(randomInt(100, 300));

  element.focus();
  await sleep(randomInt(50, 100));

  // Clear existing value first
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const valueProto = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(valueProto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(element, '');
    } else {
      element.setAttribute('value', '');
    }
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  } else if (element.isContentEditable) {
    element.textContent = '';
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Occasional typo + backspace (if humanize enabled)
    if (options.humanize && random(0, 1) < 0.03 && i > 0) {
      // Type a random wrong character
      const wrongChar = String.fromCharCode(randomInt(97, 122));
      await typeChar(element, wrongChar);
      await sleep(randomInt(80, 200));
      
      // Backspace
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace', code: 'Backspace' }));
        const current = element.value;
        const newValue = current.slice(0, -1);
        const valueProto = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(valueProto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(element, newValue);
        } else {
          element.setAttribute('value', newValue);
        }

        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace', code: 'Backspace' }));
      } else if (element.isContentEditable) {
        document.execCommand('delete', false);
      }
      await sleep(randomInt(100, 200));
    }

    // Type the actual character
    await typeChar(element, char);
    
    // Variable delay per character (40-120ms)
    let delay = randomInt(40, 120);
    
    // Occasional thinking pause (every 5-10 chars)
    if (i > 0 && i % randomInt(5, 10) === 0) {
      delay = randomInt(200, 400);
    }
    
    await sleep(delay);
  }
}

// ============================================================================
// Scroll Behaviors
// ============================================================================

/**
 * Smooth scroll to element or by delta with human-like timing.
 */
export async function humanScroll(options: {
  element?: Element;
  deltaY?: number;
  behavior?: 'auto' | 'smooth';
}): Promise<void> {
  const behavior = options.behavior || 'smooth';

  if (options.element) {
    options.element.scrollIntoView({ behavior, block: 'center' });
  } else if (options.deltaY !== undefined) {
    // Smooth scroll by delta
    if (behavior === 'smooth') {
      const steps = 10;
      const stepSize = options.deltaY / steps;
      for (let i = 0; i < steps; i++) {
        window.scrollBy(0, stepSize);
        await sleep(randomInt(20, 50));
      }
    } else {
      window.scrollBy(0, options.deltaY);
    }
  }

  // Add micro-scroll jitter (simulate human hand movement)
  await sleep(randomInt(100, 300));
  const jitter = randomInt(-2, 2);
  window.scrollBy(0, jitter);
}

// ============================================================================
// Timing Jitter
// ============================================================================

/**
 * Adds random timing jitter to simulate non-machine response times.
 * Wraps any async function with a random delay.
 */
export async function withJitter<T>(fn: () => Promise<T>): Promise<T> {
  const jitterMs = randomInt(20, 80);
  await sleep(jitterMs);
  return fn();
}

/**
 * Loads stealth mode setting from extension storage.
 */
export async function getStealthMode(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get('stealthMode');
    return result.stealthMode ?? false;
  } catch {
    return false;
  }
}

/**
 * Saves stealth mode setting to extension storage.
 */
export async function setStealthMode(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ stealthMode: enabled });
  } catch {}
}
