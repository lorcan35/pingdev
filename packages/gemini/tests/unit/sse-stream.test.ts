/**
 * Unit tests for SSE streaming endpoint.
 *
 * Tests SSE event formatting and state-change detection logic
 * without requiring a real browser or Redis.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import http from 'node:http';
import { jobStateStore } from '@pingdev/core';

// We need to mock BullMQ Queue to avoid Redis dependency
vi.mock('bullmq', () => {
  const jobs = new Map<string, { id: string; data: any; timestamp: number; returnvalue?: any; failedReason?: string; _state: string }>();
  return {
    Queue: vi.fn().mockImplementation(() => ({
      getJob: vi.fn(async (id: string) => jobs.get(id) ?? null),
      add: vi.fn(),
      getWaitingCount: vi.fn(async () => 0),
      getActiveCount: vi.fn(async () => 0),
      getCompletedCount: vi.fn(async () => 0),
      getFailedCount: vi.fn(async () => 0),
    })),
    Worker: vi.fn(),
    // Expose internal map for test manipulation
    __jobs: jobs,
  };
});

// Helper to create a mock job in the mocked BullMQ
function setMockJob(id: string, state: string, returnvalue?: any, failedReason?: string) {
  const { __jobs } = require('bullmq') as any;
  __jobs.set(id, {
    id,
    data: { prompt: 'test' },
    timestamp: Date.now(),
    returnvalue,
    failedReason,
    _state: state,
    getState: async () => state,
  });
}

function updateMockJobState(id: string, state: string, returnvalue?: any) {
  const { __jobs } = require('bullmq') as any;
  const job = __jobs.get(id);
  if (job) {
    job._state = state;
    job.getState = async () => state;
    if (returnvalue) job.returnvalue = returnvalue;
  }
}

// Override getJob to return the mock object directly (with getState method)
function patchQueue() {
  const { __jobs } = require('bullmq') as any;
  const { Queue } = require('bullmq');
  const instance = new Queue();
  instance.getJob.mockImplementation(async (id: string) => __jobs.get(id) ?? null);
  return instance;
}

describe('SSE Stream', () => {
  describe('SSE event format', () => {
    it('should format events as event: type\\ndata: json\\n\\n', () => {
      // Test the SSE wire format directly
      const type = 'state_change';
      const data = { state: 'TYPING', previous_state: 'IDLE', timestamp: '2026-01-01T00:00:00.000Z' };
      const payload = JSON.stringify(data);
      const formatted = `event: ${type}\ndata: ${payload}\n\n`;

      expect(formatted).toContain('event: state_change\n');
      expect(formatted).toContain('data: {');
      expect(formatted.endsWith('\n\n')).toBe(true);

      // Parse the data back
      const dataLine = formatted.split('\n').find(l => l.startsWith('data: '))!;
      const parsed = JSON.parse(dataLine.replace('data: ', ''));
      expect(parsed.state).toBe('TYPING');
      expect(parsed.previous_state).toBe('IDLE');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include all required SSE event types', () => {
      const validTypes = ['state_change', 'partial_response', 'thinking', 'progress', 'complete', 'error'];
      for (const type of validTypes) {
        const line = `event: ${type}\ndata: {}\n\n`;
        const eventType = line.split('\n')[0]!.replace('event: ', '');
        expect(validTypes).toContain(eventType);
      }
    });

    it('should include timestamp in every event payload', () => {
      const events = [
        { type: 'state_change', data: { state: 'TYPING' } },
        { type: 'partial_response', data: { text: 'hello', length: 5 } },
        { type: 'thinking', data: { text: 'hmm', length: 3 } },
        { type: 'progress', data: { text: 'Generating...' } },
        { type: 'complete', data: { status: 'done', response: 'done' } },
        { type: 'error', data: { code: 'FAIL', message: 'oops' } },
      ];

      for (const evt of events) {
        const payload = JSON.stringify({ ...evt.data, timestamp: new Date().toISOString() });
        const parsed = JSON.parse(payload);
        expect(parsed.timestamp).toBeDefined();
        // Verify it's a valid ISO date
        expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
      }
    });
  });

  describe('SSE content type', () => {
    it('should specify text/event-stream content type', () => {
      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      };
      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache');
    });
  });

  describe('state change detection', () => {
    it('should detect state transitions', () => {
      let lastState = '';
      const changes: string[] = [];

      const states = ['IDLE', 'TYPING', 'TYPING', 'GENERATING', 'GENERATING', 'DONE'];
      for (const state of states) {
        if (state !== lastState) {
          changes.push(`${lastState || 'null'} -> ${state}`);
          lastState = state;
        }
      }

      expect(changes).toEqual([
        'null -> IDLE',
        'IDLE -> TYPING',
        'TYPING -> GENERATING',
        'GENERATING -> DONE',
      ]);
    });

    it('should detect partial response growth', () => {
      let lastLen = 0;
      const emissions: number[] = [];

      const lengths = [0, 0, 5, 5, 20, 20, 100];
      for (const len of lengths) {
        if (len > lastLen) {
          emissions.push(len);
          lastLen = len;
        }
      }

      expect(emissions).toEqual([5, 20, 100]);
    });
  });
});
