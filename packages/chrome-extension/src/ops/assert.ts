// assert — Verification/Testing
import type { BridgeResponse } from '../types';
import { findElement, isVisible } from './helpers';

interface AssertionDef {
  type: string;
  selector?: string;
  expected?: string;
  attribute?: string;
}

interface AssertCommand {
  assertions: AssertionDef[];
}

interface AssertionResult {
  assertion: AssertionDef;
  passed: boolean;
  actual?: string;
  expected?: string;
}

export async function handleAssert(command: AssertCommand): Promise<BridgeResponse> {
  const { assertions } = command;
  if (!assertions || !Array.isArray(assertions)) {
    return { success: false, error: 'Missing assertions array' };
  }

  const results: AssertionResult[] = [];
  let allPassed = true;

  for (const assertion of assertions) {
    const result = checkAssertion(assertion);
    results.push(result);
    if (!result.passed) allPassed = false;
  }

  return {
    success: true,
    data: { passed: allPassed, results },
  };
}

function checkAssertion(assertion: AssertionDef): AssertionResult {
  const { type, selector, expected, attribute } = assertion;
  const el = selector ? findElement(selector) : null;

  switch (type) {
    case 'exists':
      return { assertion, passed: el !== null, actual: el ? 'exists' : 'not found' };

    case 'notExists':
      return { assertion, passed: el === null, actual: el ? 'exists' : 'not found' };

    case 'visible':
      return {
        assertion,
        passed: el !== null && isVisible(el),
        actual: el ? (isVisible(el) ? 'visible' : 'hidden') : 'not found',
      };

    case 'hidden':
      return {
        assertion,
        passed: el === null || !isVisible(el),
        actual: el ? (isVisible(el) ? 'visible' : 'hidden') : 'not found',
      };

    case 'text': {
      const actual = el?.textContent?.trim() || '';
      return {
        assertion,
        passed: actual === (expected || ''),
        actual,
        expected,
      };
    }

    case 'textContains': {
      const actual = el?.textContent?.trim() || '';
      const lowerExpected = (expected || '').toLowerCase();
      return {
        assertion,
        passed: actual.toLowerCase().includes(lowerExpected),
        actual,
        expected,
      };
    }

    case 'value': {
      let actual = '';
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        actual = el.value;
      }
      return {
        assertion,
        passed: actual === (expected || ''),
        actual,
        expected,
      };
    }

    case 'class': {
      const actual = el?.className || '';
      return {
        assertion,
        passed: el !== null && el.classList.contains(expected || ''),
        actual,
        expected,
      };
    }

    case 'attribute': {
      if (!attribute) return { assertion, passed: false, actual: 'no attribute specified' };
      const actual = el?.getAttribute(attribute) || '';
      if (expected !== undefined) {
        return { assertion, passed: actual === expected, actual, expected };
      }
      return { assertion, passed: el?.hasAttribute(attribute) || false, actual };
    }

    case 'count': {
      if (!selector) return { assertion, passed: false, actual: '0', expected };
      const count = document.querySelectorAll(selector).length;
      const expectedCount = parseInt(expected || '0', 10);
      return {
        assertion,
        passed: count === expectedCount,
        actual: String(count),
        expected: String(expectedCount),
      };
    }

    default:
      return { assertion, passed: false, actual: `Unknown assertion type: ${type}` };
  }
}
