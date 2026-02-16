import { type HealthResponse } from '../lib/api';
export interface AppHealth {
    port: number;
    health: HealthResponse | null;
    error: string | null;
    loading: boolean;
}
export declare function useHealth(port: number, intervalMs?: number): {
    refresh: () => Promise<void>;
    port: number;
    health: HealthResponse | null;
    error: string | null;
    loading: boolean;
};
export declare function useMultiHealth(ports: number[], intervalMs?: number): Map<number, AppHealth>;
//# sourceMappingURL=useHealth.d.ts.map