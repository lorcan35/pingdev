import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { ConversationConfig, RedisConfig } from '../types.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'conversation-store' });

export interface ConversationEntry {
  conversation_id: string;
  url: string;
  last_used: string;
  created_at: string;
}

export class ConversationStore {
  private redis: Redis | null = null;
  private redisConfig: RedisConfig;
  private convoConfig: ConversationConfig;

  constructor(redisConfig: RedisConfig, convoConfig: ConversationConfig) {
    this.redisConfig = redisConfig;
    this.convoConfig = convoConfig;
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

  private buildKey(conversationId: string): string {
    return `${this.convoConfig.keyPrefix}:${conversationId}`;
  }

  async get(conversationId: string): Promise<ConversationEntry | null> {
    const r = this.getRedis();
    const key = this.buildKey(conversationId);

    try {
      const raw = await r.get(key);
      if (!raw) return null;

      const entry: ConversationEntry = JSON.parse(raw);
      entry.last_used = new Date().toISOString();
      const ttlSec = Math.ceil(this.convoConfig.ttlMs / 1000);
      await r.set(key, JSON.stringify(entry), 'EX', ttlSec);

      log.info({ conversationId, url: entry.url }, 'Conversation found');
      return entry;
    } catch (err) {
      log.warn({ err: String(err), conversationId }, 'Failed to look up conversation');
      return null;
    }
  }

  async store(url: string, conversationId?: string): Promise<string> {
    const r = this.getRedis();
    const id = conversationId ?? randomUUID();
    const key = this.buildKey(id);

    const entry: ConversationEntry = {
      conversation_id: id,
      url,
      last_used: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    try {
      const ttlSec = Math.ceil(this.convoConfig.ttlMs / 1000);
      await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
      log.info({ conversationId: id, url }, 'Conversation stored');
    } catch (err) {
      log.warn({ err: String(err), conversationId: id }, 'Failed to store conversation');
    }

    return id;
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
