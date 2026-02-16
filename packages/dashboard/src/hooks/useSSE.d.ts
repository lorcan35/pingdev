export interface SSEStreamEvent {
    type: string;
    data: Record<string, unknown>;
    receivedAt: string;
}
export declare function useSSE(port: number, jobId: string | null): {
    events: SSEStreamEvent[];
    connected: boolean;
    error: string | null;
    connect: () => void;
    disconnect: () => void;
};
//# sourceMappingURL=useSSE.d.ts.map