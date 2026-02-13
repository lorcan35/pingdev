import pino from 'pino';

export function createLogger(name: string, level?: string): pino.Logger {
  return pino({
    name,
    level: level ?? process.env['LOG_LEVEL'] ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}

export const logger = createLogger('pingdev-core');
