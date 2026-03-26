import * as cdp from './cdp.js';
import { createServer } from './api.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

const log = (...args) => console.log('[main]', ...args);
const logErr = (...args) => console.error('[main]', ...args);

function printBanner() {
  console.log(`
   ____                 _ _         ____       _     _
  / ___|_ __ __ ___   _(_) |_ _   | __ ) _ __(_) __| | __ _  ___
 | |  _| '__/ _\` \\ \\ / / | __| | | |  _ \\| '__| |/ _\` |/ _\` |/ _ \\
 | |_| | | | (_| |\\ V /| | |_| |_| | |_) | |  | | (_| | (_| |  __/
  \\____|_|  \\__,_| \\_/ |_|\\__|\\__, |____/|_|  |_|\\__,_|\\__, |\\___|
                               |___/                    |___/
`);
}

async function connectWithRetry() {
  while (true) {
    try {
      await cdp.connect();
      return;
    } catch (err) {
      logErr(`CDP connection failed: ${err.message}`);
      logErr('Retrying in 5 seconds...');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  printBanner();

  log(`Connecting to CDP at ${CDP_URL}...`);
  await connectWithRetry();

  await cdp.isReady();

  const model = await cdp.getSelectedModel();
  if (model) log(`Current model: ${model}`);

  const { start } = createServer(PORT);
  start();

  log(`GravityBridge ready — API at http://localhost:${PORT}`);
}

// Graceful shutdown
function shutdown(signal) {
  log('Shutting down...');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Don't crash on unhandled errors
process.on('uncaughtException', (err) => {
  logErr('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logErr('Unhandled rejection:', reason);
});

main();
