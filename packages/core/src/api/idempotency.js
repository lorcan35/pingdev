"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyStore = void 0;
const node_crypto_1 = require("node:crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'idempotency' });
class IdempotencyStore {
    redis = null;
    redisConfig;
    idempConfig;
    constructor(redisConfig, idempConfig) {
        this.redisConfig = redisConfig;
        this.idempConfig = idempConfig;
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
    static normalizePrompt(prompt) {
        return prompt.trim().replace(/\s+/g, ' ');
    }
    buildKey(idempotencyKey, prompt) {
        const hash = (0, node_crypto_1.createHash)('sha256')
            .update(IdempotencyStore.normalizePrompt(prompt))
            .digest('hex');
        return `${this.idempConfig.keyPrefix}:${idempotencyKey}:${hash}`;
    }
    async check(idempotencyKey, prompt) {
        const r = this.getRedis();
        const key = this.buildKey(idempotencyKey, prompt);
        try {
            const raw = await r.get(key);
            if (!raw)
                return null;
            const entry = JSON.parse(raw);
            log.info({ key, status: entry.status, jobId: entry.job_id }, 'Idempotency cache hit');
            return entry;
        }
        catch (err) {
            log.warn({ err: String(err), key }, 'Idempotency check failed, proceeding as new');
            return null;
        }
    }
    async storePending(idempotencyKey, prompt, jobId) {
        const r = this.getRedis();
        const key = this.buildKey(idempotencyKey, prompt);
        const entry = {
            job_id: jobId,
            status: 'pending',
            created_at: new Date().toISOString(),
        };
        try {
            const ttlSec = Math.ceil(this.idempConfig.ttlMs / 1000);
            await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
            log.info({ key, jobId }, 'Idempotency pending entry stored');
        }
        catch (err) {
            log.warn({ err: String(err), key }, 'Failed to store idempotency pending entry');
        }
    }
    async storeResult(idempotencyKey, prompt, result) {
        const r = this.getRedis();
        const key = this.buildKey(idempotencyKey, prompt);
        const entry = {
            job_id: result.job_id,
            status: result.status === 'done' ? 'done' : 'failed',
            result,
            created_at: new Date().toISOString(),
        };
        try {
            const ttlSec = Math.ceil(this.idempConfig.ttlMs / 1000);
            await r.set(key, JSON.stringify(entry), 'EX', ttlSec);
            log.info({ key, jobId: result.job_id, status: entry.status }, 'Idempotency result stored');
        }
        catch (err) {
            log.warn({ err: String(err), key }, 'Failed to store idempotency result');
        }
    }
    async close() {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
        }
    }
}
exports.IdempotencyStore = IdempotencyStore;
//# sourceMappingURL=idempotency.js.map