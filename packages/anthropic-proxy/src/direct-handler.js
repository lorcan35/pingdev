const { Readable } = require('node:stream');

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildForwardHeaders(incomingHeaders, ccHeaders) {
  const headers = {};

  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection') {
      continue;
    }
    if (value !== undefined) {
      headers[lower] = value;
    }
  }

  headers['content-type'] = 'application/json';

  for (const [key, value] of Object.entries(ccHeaders || {})) {
    headers[key.toLowerCase()] = value;
  }

  return headers;
}

async function forwardDirect({ reqHeaders, payload, res, config, rateLimiter }) {
  const jitterMs = randomBetween(config.jitter_min_ms, config.jitter_max_ms);
  const limiterDelayMs = rateLimiter.nextDelayMs();
  await sleep(jitterMs + limiterDelayMs);

  const targetUrl = `${config.anthropic_base_url}/v1/messages`;
  const headers = buildForwardHeaders(reqHeaders, config.cc_headers);

  const upstream = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  res.statusCode = upstream.status;

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-length' || lower === 'transfer-encoding' || lower === 'connection') {
      return;
    }
    res.setHeader(key, value);
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

module.exports = {
  forwardDirect,
};
