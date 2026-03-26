const { spawn } = require('node:child_process');
const readline = require('node:readline');

function contentToText(content) {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        if (item.type === 'text' && typeof item.text === 'string') return item.text;
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }

  return '';
}

function buildPrompt(payload) {
  const sections = [];

  if (payload?.system) {
    const systemText = contentToText(payload.system);
    if (systemText) {
      sections.push(`SYSTEM:\n${systemText}`);
    }
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  for (const msg of messages) {
    const role = (msg?.role || 'user').toUpperCase();
    const text = contentToText(msg?.content);
    if (text) {
      sections.push(`${role}:\n${text}`);
    }
  }

  sections.push('ASSISTANT:');
  return sections.join('\n\n');
}

function extractTextFromStreamLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return '';
  }

  if (parsed?.type === 'content_block_delta' && typeof parsed?.delta?.text === 'string') {
    return parsed.delta.text;
  }

  if (typeof parsed?.delta?.text === 'string') {
    return parsed.delta.text;
  }

  if (typeof parsed?.text === 'string') {
    return parsed.text;
  }

  if (Array.isArray(parsed?.message?.content)) {
    return contentToText(parsed.message.content);
  }

  if (Array.isArray(parsed?.content)) {
    return contentToText(parsed.content);
  }

  return '';
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleViaCli({ payload, res, config }) {
  const prompt = buildPrompt(payload);
  const streamMode = payload?.stream !== false;

  return new Promise((resolve) => {
    let finished = false;
    let sawOutput = false;
    let sseStarted = false;
    let fullText = '';
    let stderr = '';

    function done(result) {
      if (finished) return;
      finished = true;
      resolve(result);
    }

    const child = spawn(config.cli_path, ['--print', '--verbose', '--output-format', 'stream-json', '-p', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('error', (err) => {
      done({ handled: false, reason: err.message || 'Failed to spawn claude CLI' });
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    function startSse() {
      if (sseStarted) return;
      sseStarted = true;

      res.statusCode = 200;
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.setHeader('cache-control', 'no-cache');
      res.setHeader('connection', 'keep-alive');

      writeSse(res, {
        type: 'message_start',
        message: {
          id: `msg_cli_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: payload?.model || 'claude-cli',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });

      writeSse(res, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    }

    const rl = readline.createInterface({ input: child.stdout });

    rl.on('line', (line) => {
      const text = extractTextFromStreamLine(line);
      if (!text) return;

      sawOutput = true;
      fullText += text;

      if (streamMode) {
        startSse();
        writeSse(res, {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text },
        });
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && !sawOutput && !sseStarted) {
        done({ handled: false, reason: stderr.trim() || `Claude CLI exited with code ${code}` });
        return;
      }

      if (streamMode) {
        startSse();
        writeSse(res, { type: 'content_block_stop', index: 0 });
        writeSse(res, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null } });
        writeSse(res, { type: 'message_stop' });
        res.write('data: [DONE]\n\n');
        res.end();
        done({ handled: true });
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          id: `msg_cli_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: payload?.model || 'claude-cli',
          content: [{ type: 'text', text: fullText }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        })
      );
      done({ handled: true });
    });
  });
}

module.exports = {
  handleViaCli,
};
