// @pingdev/std — POSIX-style error constructors and HTTP mapping
// Dual-error design: errno for machine routing + code for human debugging
// ---------------------------------------------------------------------------
// errno → HTTP status mapping
// ---------------------------------------------------------------------------
const ERRNO_HTTP_MAP = {
    ENOENT: 404,
    ENODEV: 404,
    EACCES: 403,
    EBUSY: 409,
    ETIMEDOUT: 503,
    EAGAIN: 429,
    ENOSYS: 422,
    EOPNOTSUPP: 422,
    EIO: 502,
    ECANCELED: 499,
};
/** Map a PingOS errno to the appropriate HTTP status code. */
export function mapErrnoToHttp(errno) {
    return ERRNO_HTTP_MAP[errno];
}
// ---------------------------------------------------------------------------
// Named error constructors (Claude's pattern + Codex's domain codes)
// ---------------------------------------------------------------------------
function mkError(errno, code, message, retryable, extra) {
    return {
        errno,
        code,
        message,
        retryable,
        ...extra,
    };
}
/** No driver found for requested device/capability. */
export function ENOENT(device) {
    return mkError('ENOENT', 'ping.router.no_driver', `No driver available for ${device}`, false);
}
/** Authentication or authorization required. */
export function EACCES(driver, reason) {
    return mkError('EACCES', 'ping.driver.auth_required', `Driver ${driver}: ${reason}`, false);
}
/** Resource busy — e.g. single-concurrency PingApp already processing. */
export function EBUSY(driver) {
    return mkError('EBUSY', 'ping.driver.concurrency_exceeded', `Driver ${driver} is busy (single concurrency)`, true, { retryAfterMs: 5000 });
}
/** Request timed out. */
export function ETIMEDOUT(driver, ms) {
    return mkError('ETIMEDOUT', 'ping.driver.timeout', `Driver ${driver} timed out after ${ms}ms`, true);
}
/** Rate limited — try again later. */
export function EAGAIN(driver, retryAfterMs) {
    return mkError('EAGAIN', 'ping.driver.rate_limited', `Driver ${driver} rate limited`, true, { retryAfterMs });
}
/** Capability not implemented by driver. */
export function ENOSYS(driver, capability) {
    return mkError('ENOSYS', 'ping.driver.not_implemented', `Driver ${driver} does not implement ${capability}`, false);
}
/** Device not found in registry. */
export function ENODEV(device) {
    return mkError('ENODEV', 'ping.registry.device_not_found', `Device ${device} not found in registry`, false);
}
/** Operation not supported by this driver. */
export function EOPNOTSUPP(driver, op) {
    return mkError('EOPNOTSUPP', 'ping.driver.op_not_supported', `Driver ${driver} does not support operation: ${op}`, false);
}
/** I/O error — backend returned unexpected response or connection failed. */
export function EIO(driver, details) {
    return mkError('EIO', 'ping.driver.io_error', `Driver ${driver} encountered an I/O error`, true, { details });
}
/** Operation was canceled by the caller. */
export function ECANCELED(driver) {
    return mkError('ECANCELED', 'ping.driver.canceled', `Request to driver ${driver} was canceled`, false);
}
//# sourceMappingURL=errors.js.map