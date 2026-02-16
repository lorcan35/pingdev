type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'offline' | 'loading' | (string & {});
export declare function HealthPulse({ status, size, }: {
    status: HealthStatus;
    /** dot size in px */
    size?: number;
}): import("react").JSX.Element;
export declare function QueueFlow({ waiting, active, completed, failed, }: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
}): import("react").JSX.Element;
export declare function StateStrip({ waiting, active, }: {
    waiting: number;
    active: number;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=AppViz.d.ts.map