"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const node_crypto_1 = require("node:crypto");
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'conversation-store' });
class ConversationStore {
    redis = null;
    redisConfig;
    convoConfig;
    constructor(redisConfig, convoConfig) {
        this.redisConfig = redisConfig;
        this.convoConfig = convoConfig;
    }
    getRedis() {
        if (!this.redis) {
            this.redis = new ioredis_1.default({
                host: this.redisConfig.host,
                port: this.redisConfig.port,
                lazyConnect: true,
                maxRetriesPerRequest: 3,
            });
        }
        return this.redis;
    }
    buildKey(conversationId) {
        return `${this.convoConfig.keyPrefix}:${conversationId}`;
    }
    async get(conversationId) {
        const r = this.getRedis();
        const key = this.buildKey(conversationId);
        try {
            const raw = await r.get(key);
            if (!raw)
                return null;
            const entry = JSON.parse(raw);
            entry.last_used = new Date().toISOString();
            const ttlSec = Math.ceil(this.convoConfig.ttlMs / 1000);
            await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
            log.info({ conversationId, url: entry.url }, 'Conversation found');
            return entry;
        }
        catch (err) {
            log.warn({ err: String(err), conversationId }, 'Failed to look up conversation');
            return null;
        }
    }
    async store(url, conversationId) {
        const r = this.getRedis();
        const id = conversationId ?? (0, node_crypto_1.randomUUID)();
        const key = this.buildKey(id);
        const entry = {
            conversation_id: id,
            url,
            last_used: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };
        try {
            const ttlSec = Math.ceil(this.convoConfig.ttlMs / 1000);
            await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
            log.info({ conversationId: id, url }, 'Conversation stored');
        }
        catch (err) {
            log.warn({ err: String(err), conversationId: id }, 'Failed to store conversation');
        }
        return id;
    }
    async close() {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
        }
    }
}
exports.ConversationStore = ConversationStore;
//# sourceMappingURL=conversation-store.js.map