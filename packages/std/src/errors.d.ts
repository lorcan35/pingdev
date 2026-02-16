import type { PingError, PingErrno } from './types.js';
/** Map a PingOS errno to the appropriate HTTP status code. */
export declare function mapErrnoToHttp(errno: PingErrno): number;
/** No driver found for requested device/capability. */
export declare function ENOENT(device: string): PingError;
/** Authentication or authorization required. */
export declare function EACCES(driver: string, reason: string): PingError;
/** Resource busy — e.g. single-concurrency PingApp already processing. */
export declare function EBUSY(driver: string): PingError;
/** Request timed out. */
export declare function ETIMEDOUT(driver: string, ms: number): PingError;
/** Rate limited — try again later. */
export declare function EAGAIN(driver: string, retryAfterMs: number): PingError;
/** Capability not implemented by driver. */
export declare function ENOSYS(driver: string, capability: string): PingError;
/** Device not found in registry. */
export declare function ENODEV(device: string): PingError;
/** Operation not supported by this driver. */
export declare function EOPNOTSUPP(driver: string, op: string): PingError;
/** I/O error — backend returned unexpected response or connection failed. */
export declare function EIO(driver: string, details?: unknown): PingError;
/** Operation was canceled by the caller. */
export declare function ECANCELED(driver: string): PingError;
//# sourceMappingURL=errors.d.ts.map