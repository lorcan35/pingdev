import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import type { IdempotencyConfig, RedisConfig, EnhancedJobResult } from '../types.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'idempotency' });

export interface IdempotencyEntry {
  job_id: string;
  status: 'pending' | 'done' | 'failed';
  result?: EnhancedJobResult;
  created_at: string;
}

export class IdempotencyStore {
  private redis: Redis | null = null;
  private redisConfig: RedisConfig;
  private idempConfig: IdempotencyConfig;

  constructor(redisConfig: RedisConfig, idempConfig: IdempotencyConfig) {
    this.redisConfig = redisConfig;
    this.idempConfig = idempConfig;
  }

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.redisConfig.host,
        port: this.redisConfig.port,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    }
    return this.redis;
  }

  static normalizePrompt(prompt: string): string {
    return prompt.trim().replace(/\s+/g, ' ');
  }

  buildKey(idempotencyKey: string, prompt: string): string {
    const hash = createHash('sha256')
      .update(IdempotencyStore.normalizePrompt(prompt))
      .digest('hex');
    return `${this.idempConfig.keyPrefix}:${idempotencyKey}:${hash}`;
  }

  async check(idempotencyKey: string, prompt: string): Promise<IdempotencyEntry | null> {
    const r = this.getRedis();
    const key = this.buildKey(idempotencyKey, prompt);

    try {
      const raw = await r.get(key);
      if (!raw) return null;

      const entry: IdempotencyEntry = JSON.parse(raw);
      log.info({ key, status: entry.status, jobId: entry.job_id }, 'Idempotency cache hit');
      return entry;
    } catch (err) {
      log.warn({ err: String(err), key }, 'Idempotency check failed, proceeding as new');
      return null;
    }
  }

  async storePending(idempotencyKey: string, prompt: string, jobId: string): Promise<void> {
    const r = this.getRedis();
    const key = this.buildKey(idempotencyKey, prompt);

    const entry: IdempotencyEntry = {
      job_id: jobId,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    try {
      const ttlSec = Math.ceil(this.idempConfig.ttlMs / 1000);
      await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
      log.info({ key, jobId }, 'Idempotency pending entry stored');
    } catch (err) {
      log.warn({ err: String(err), key }, 'Failed to store idempotency pending entry');
    }
  }

  async storeResult(idempotencyKey: string, prompt: string, result: EnhancedJobResult): Promise<void> {
    const r = this.getRedis();
    const key = this.buildKey(idempotencyKey, prompt);

    const entry: IdempotencyEntry = {
      job_id: result.job_id,
      status: result.status === 'done' ? 'done' : 'failed',
      result,
      created_at: new Date().toISOString(),
    };

    try {
      const ttlSec = Math.ceil(this.idempConfig.ttlMs / 1000);
      await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
      log.info({ key, jobId: result.job_id, status: entry.status }, 'Idempotency result stored');
    } catch (err) {
      log.warn({ err: String(err), key }, 'Failed to store idempotency result');
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
