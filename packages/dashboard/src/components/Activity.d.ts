export type ActivityLevel = 'info' | 'good' | 'warn' | 'bad';
export interface ActivityItem {
    id: string;
    ts: number;
    level: ActivityLevel;
    appPort?: number;
    appName?: string;
    kind: string;
    message: string;
    meta?: Record<string, unknown>;
}
interface ActivityCtx {
    items: ActivityItem[];
    push: (item: Omit<ActivityItem, 'id' | 'ts'> & {
        ts?: number;
    }) => void;
}
export declare function ActivityProvider({ children }: {
    children: React.ReactNode;
}): import("react").JSX.Element;
export declare function useActivity(): ActivityCtx;
export declare function ActivityFeed({ compact }: {
    compact?: boolean;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=Activity.d.ts.map