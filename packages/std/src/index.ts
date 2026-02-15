// @pingdev/std — barrel exports

export type {
  BackendType,
  RoutingStrategy,
  DriverCapabilities,
  ContentPart,
  Message,
  DriverRegistration,
  HealthStatus,
  DriverHealth,
  ModelInfo,
  DeviceRequest,
  DeviceResponse,
  TokenUsage,
  Artifact,
  StreamChunk,
  PingErrno,
  PingError,
  Driver,
} from './types.js';

export {
  mapErrnoToHttp,
  ENOENT,
  EACCES,
  EBUSY,
  ETIMEDOUT,
  EAGAIN,
  ENOSYS,
  ENODEV,
  EOPNOTSUPP,
  EIO,
  ECANCELED,
} from './errors.js';

export type { PingOSConfig, DriverConfig } from './config.js';
export { DEFAULT_CONFIG, loadConfig } from './config.js';

export { ModelRegistry } from './registry.js';

export { resolveStrategy } from './routing/index.js';
export type { RoutingState } from './routing/index.js';

export {
  PingAppAdapter,
  OpenAICompatAdapter,
  AnthropicAdapter,
} from './drivers/index.js';
export type {
  PingAppAdapterOptions,
  OpenAICompatAdapterOptions,
  AnthropicAdapterOptions,
} from './drivers/index.js';

export { createGateway } from './gateway.js';
export type { GatewayOptions } from './gateway.js';
