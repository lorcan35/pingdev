import type { ConversationConfig, RedisConfig } from '../types.js';
export interface ConversationEntry {
    conversation_id: string;
    url: string;
    last_used: string;
    created_at: string;
}
export declare class ConversationStore {
    private redis;
    private redisConfig;
    private convoConfig;
    constructor(redisConfig: RedisConfig, convoConfig: ConversationConfig);
    private getRedis;
    private buildKey;
    get(conversationId: string): Promise<ConversationEntry | null>;
    store(url: string, conversationId?: string): Promise<string>;
    close(): Promise<void>;
}
//# sourceMappingURL=conversation-store.d.ts.map