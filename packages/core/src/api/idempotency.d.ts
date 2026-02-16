import type { IdempotencyConfig, RedisConfig, EnhancedJobResult } from '../types.js';
export interface IdempotencyEntry {
    job_id: string;
    status: 'pending' | 'done' | 'failed';
    result?: EnhancedJobResult;
    created_at: string;
}
export declare class IdempotencyStore {
    private redis;
    private redisConfig;
    private idempConfig;
    constructor(redisConfig: RedisConfig, idempConfig: IdempotencyConfig);
    private getRedis;
    static normalizePrompt(prompt: string): string;
    buildKey(idempotencyKey: string, prompt: string): string;
    check(idempotencyKey: string, prompt: string): Promise<IdempotencyEntry | null>;
    storePending(idempotencyKey: string, prompt: string, jobId: string): Promise<void>;
    storeResult(idempotencyKey: string, prompt: string, result: EnhancedJobResult): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=idempotency.d.ts.map