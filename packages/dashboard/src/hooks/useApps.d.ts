import { type PingAppConfig } from '../lib/api';
/**
 * LocalStorage-backed PingApp registry with in-tab change notifications.
 * This keeps App shell, command bar, and pages in sync.
 */
export declare function useApps(): {
    apps: PingAppConfig[];
    refresh: () => void;
    addApp: (app: PingAppConfig) => any;
    removeApp: (port: number) => any;
};
//# sourceMappingURL=useApps.d.ts.map