const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { shouldUseDirectPath } = require('./inspector');
const { handleViaCli } = require('./cli-handler');
const { forwardDirect } = require('./direct-handler');
const { SlidingWindowRateLimiter } = require('./rate-limiter');

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const rateLimiter = new SlidingWindowRateLimiter(config.max_requests_per_2s, 2000);

const stats = {
  started_at: new Date().toISOString(),
  total_requests: 0,
  path_a_requests: 0,
  path_b_requests: 0,
  path_a_fallbacks: 0,
  errors: 0,
};

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

async function handleMessageRequest(req, res) {
  let payload;
  try {
    payload = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  stats.total_requests += 1;

  const usePathB = shouldUseDirectPath(payload);

  try {
    if (usePathB) {
      stats.path_b_requests += 1;
      await forwardDirect({
        reqHeaders: req.headers,
        payload,
        res,
        config,
        rateLimiter,
      });
      return;
    }

    stats.path_a_requests += 1;
    const cliResult = await handleViaCli({ payload, res, config });

    if (cliResult?.handled) {
      return;
    }

    stats.path_a_fallbacks += 1;
    stats.path_b_requests += 1;

    await forwardDirect({
      reqHeaders: req.headers,
      payload,
      res,
      config,
      rateLimiter,
    });
  } catch (err) {
    stats.errors += 1;
    sendJson(res, 502, {
      error: 'Proxy request failed',
      details: err.message,
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', mode: 'proxy' });
    return;
  }

  if (req.method === 'GET' && req.url === '/stats') {
    sendJson(res, 200, stats);
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/messages') {
    await handleMessageRequest(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`PingOS Anthropic Proxy listening on http://localhost:${config.port}`);
});

server.on('error', (err) => {
  console.error(`Failed to start proxy server: ${err.message}`);
  process.exitCode = 1;
});
