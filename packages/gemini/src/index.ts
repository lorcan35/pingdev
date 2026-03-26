/**
 * Entry point for PingOS Gemini — the first PingApp.
 *
 * Uses @pingdev/core's createShimApp with the Gemini site definition.
 */
import { createShimApp } from '@pingdev/core';
import { geminiSite } from './site-definition.js';

const app = createShimApp(geminiSite, {
  port: 3456,
  host: '0.0.0.0',
});

app.start().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
