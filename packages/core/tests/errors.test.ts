import { describe, it, expect } from 'vitest';
import { createError, Errors } from '../src/errors/index.js';

describe('Errors', () => {
  it('creates error with default retryable=false', () => {
    const err = createError('UNKNOWN', 'test');
    expect(err.code).toBe('UNKNOWN');
    expect(err.retryable).toBe(false);
  });

  it('creates error with retryable=true', () => {
    const err = createError('BROWSER_UNAVAILABLE', 'test', { retryable: true });
    expect(err.retryable).toBe(true);
  });

  it('browserUnavailable is retryable', () => {
    const err = Errors.browserUnavailable('test detail');
    expect(err.code).toBe('BROWSER_UNAVAILABLE');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('test detail');
  });

  it('authRequired is not retryable', () => {
    const err = Errors.authRequired();
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.retryable).toBe(false);
  });

  it('generationTimeout includes elapsed time', () => {
    const err = Errors.generationTimeout(5000);
    expect(err.message).toContain('5000');
    expect(err.retryable).toBe(true);
  });

  it('selectorNotFound includes selector name', () => {
    const err = Errors.selectorNotFound('chat-input', 'IDLE');
    expect(err.message).toContain('chat-input');
    expect(err.state).toBe('IDLE');
  });
});
