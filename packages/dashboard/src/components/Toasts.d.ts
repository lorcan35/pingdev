export type ToastIntent = 'info' | 'good' | 'warn' | 'bad';
export interface ToastItem {
    id: string;
    intent: ToastIntent;
    title: string;
    message?: string;
}
interface ToastCtx {
    toast: (t: Omit<ToastItem, 'id'> & {
        ttlMs?: number;
    }) => void;
}
export declare function ToastProvider({ children }: {
    children: React.ReactNode;
}): import("react").JSX.Element;
export declare function useToast(): ToastCtx;
export {};
//# sourceMappingURL=Toasts.d.ts.map