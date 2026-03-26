import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import express from 'express';
import * as cdp from './cdp.js';
import {
  streamResponse,
  extractLastResponse,
  createStreamHandler,
  formatCompletionResponse,
} from './stream.js';

// ── Request Queue / Mutex ───────────────────────────────────────────────────
// Only one prompt can be processed at a time since we control a single GUI.

let queue = Promise.resolve();

function enqueue(fn) {
  const task = queue.then(fn);
  queue = task.catch(() => {});
  return task;
}

// ── Message Formatting ──────────────────────────────────────────────────────

function messagesToPrompt(messages) {
  if (!messages || messages.length === 0) return '';

  if (messages.length === 1) {
    return extractContent(messages[0].content);
  }

  let systemPrompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += extractContent(msg.content) + '\n';
    }
  }

  const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
  const lastUserContent = lastUserIdx >= 0 ? extractContent(messages[lastUserIdx].content) : '';

  const context = [];
  if (systemPrompt) {
    context.push(`System instructions: ${systemPrompt.trim()}`);
  }

  const priorMessages = messages.slice(0, lastUserIdx >= 0 ? lastUserIdx : messages.length);
  for (const m of priorMessages) {
    if (m.role === 'system') continue;
    const role = m.role === 'user' ? 'User' : 'Assistant';
    context.push(`${role}: ${extractContent(m.content)}`);
  }

  if (context.length > 0) {
    return `${context.join('\n\n')}\n\nUser: ${lastUserContent}`;
  }

  return lastUserContent;
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
  }
  return String(content);
}

// ── Static model list (fallback) ────────────────────────────────────────────

const STATIC_MODELS = [
  { id: 'claude-opus', name: 'Claude Opus 4.6 (Thinking)' },
  { id: 'claude-sonnet', name: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'gemini-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-pro-low', name: 'Gemini 3.1 Pro (Low)' },
  { id: 'gemini-flash', name: 'Gemini 3 Flash' },
  { id: 'gpt-oss', name: 'GPT-OSS-120b' },
];

// ── Server Factory ──────────────────────────────────────────────────────────

function createServer(port) {
  const listenPort = port || parseInt(process.env.PORT || '3456', 10);
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── GET /health ─────────────────────────────────────────────────────

  app.get('/health', async (_req, res) => {
    try {
      const ready = await cdp.isReady();
      const model = ready ? await cdp.getSelectedModel() : null;
      res.json({ status: ready ? 'ok' : 'error', connected: !!cdp.getPage(), model, ready });
    } catch (err) {
      console.log(`[api] Health check error: ${err.message}`);
      res.status(503).json({ status: 'error', connected: false, model: null, ready: false });
    }
  });

  // ── GET /v1/models ──────────────────────────────────────────────────

  app.get('/v1/models', async (_req, res) => {
    try {
      const ts = Math.floor(Date.now() / 1000);
      let models;

      if (cdp.getPage()) {
        try {
          const available = await cdp.getAvailableModels();
          models = available.map(name => ({
            id: name.toLowerCase().replace(/[\s()]+/g, '-').replace(/-+/g, '-').replace(/-$/, ''),
            object: 'model',
            created: ts,
            owned_by: 'antigravity',
            name,
          }));
        } catch { /* fall through */ }
      }

      if (!models) {
        models = STATIC_MODELS.map(m => ({
          id: m.id,
          object: 'model',
          created: ts,
          owned_by: 'antigravity',
          name: m.name,
        }));
      }

      res.json({ object: 'list', data: models });
    } catch (err) {
      console.log(`[api] Models list error: ${err.message}`);
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── POST /v1/chat/completions ───────────────────────────────────────

  app.post('/v1/chat/completions', async (req, res) => {
    const { messages, model, stream = false, mode, auto_approve = false, files } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' },
      });
    }

    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected to Antigravity', type: 'service_unavailable' },
      });
    }

    const resolvedModel = model ? cdp.resolveModel(model) : null;
    const prompt = messagesToPrompt(messages);
    const modelLabel = resolvedModel || model || 'default';

    console.log(`[api] ${stream ? 'stream' : 'complete'} | model=${modelLabel} | mode=${mode || 'default'} | auto_approve=${auto_approve} | prompt=${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`);

    try {
      await enqueue(async () => {
        // Select model if specified
        if (resolvedModel) {
          try {
            await cdp.selectModel(resolvedModel);
          } catch (err) {
            console.log(`[api] Model selection warning: ${err.message}`);
          }
        }

        // Switch mode if specified
        if (mode) {
          try {
            await cdp.selectMode(mode);
          } catch (err) {
            console.log(`[api] Mode switch warning: ${err.message}`);
          }
        }

        // Set up auto-approve if requested
        if (auto_approve) {
          try {
            await cdp.setupAutoApprove();
          } catch (err) {
            console.log(`[api] Auto-approve setup warning: ${err.message}`);
          }
        }

        // Type file references if provided, then type prompt
        if (files && Array.isArray(files) && files.length > 0) {
          // Clear input and type file refs first, then append prompt text
          await cdp.typePrompt(''); // focus and clear
          for (const file of files) {
            await cdp.typeFileReference(file);
          }
          // Append the prompt text (no clear since file refs are already there)
          await cdp.appendText(prompt);
        } else {
          await cdp.typePrompt(prompt);
        }
        await cdp.sendPrompt();

        const page = cdp.getPage();

        try {
          if (stream) {
            const handler = createStreamHandler(res, modelLabel);
            let disconnected = false;
            req.on('close', () => {
              disconnected = true;
              console.log('[api] Client disconnected during stream');
            });

            await new Promise((resolve) => {
              const cancel = streamResponse(
                page,
                (delta) => {
                  if (!disconnected) handler.onToken(delta);
                },
                (result) => {
                  // result is { content, thinking }
                  if (!disconnected) {
                    // If thinking was captured, emit it as a final info chunk before stop
                    if (result.thinking) {
                      const thinkingChunk = {
                        id: handler.id,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: modelLabel,
                        choices: [{
                          index: 0,
                          delta: { thinking: result.thinking },
                          finish_reason: null,
                        }],
                      };
                      res.write(`data: ${JSON.stringify(thinkingChunk)}\n\n`);
                    }
                    handler.finish();
                  }
                  resolve();
                },
                { timeout: 120000 }
              );

              req.on('close', () => cancel());
            });
          } else {
            // Non-streaming: wait for full response
            const response = await cdp.waitForResponse(120000, prompt);
            if (!response) {
              return res.status(504).json({
                error: { message: 'Response timed out', type: 'timeout_error' },
              });
            }

            // Try to extract thinking content
            let thinking = null;
            try {
              thinking = await cdp.extractThinking();
            } catch (err) {
              console.log(`[api] Thinking extraction warning: ${err.message}`);
            }

            res.json(formatCompletionResponse(response, modelLabel, null, thinking));
          }
        } finally {
          // Clean up auto-approve observer after request completes
          if (auto_approve) {
            try {
              await cdp.stopAutoApprove();
            } catch (err) {
              console.log(`[api] Auto-approve cleanup warning: ${err.message}`);
            }
          }
        }
      });
    } catch (err) {
      console.error(`[api] Error: ${err.message}`);
      if (res.headersSent) return;

      if (err.message?.includes('timeout')) {
        return res.status(504).json({
          error: { message: `Request timed out: ${err.message}`, type: 'timeout_error' },
        });
      }

      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── POST /v1/mode ──────────────────────────────────────────────────

  app.post('/v1/mode', async (req, res) => {
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({
        error: { message: 'mode is required ("planning" or "fast")', type: 'invalid_request_error' },
      });
    }

    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected', type: 'service_unavailable' },
      });
    }

    try {
      await cdp.selectMode(mode);
      res.json({ status: 'ok', mode });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── POST /v1/auto-approve ─────────────────────────────────────────

  app.post('/v1/auto-approve', async (req, res) => {
    const { enabled } = req.body;

    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected', type: 'service_unavailable' },
      });
    }

    try {
      if (enabled) {
        await cdp.setupAutoApprove();
      } else {
        await cdp.stopAutoApprove();
      }
      res.json({ status: 'ok', auto_approve: !!enabled });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── MCP Server Management ──────────────────────────────────────────

  const MCP_CONFIG_PATH = join(homedir(), '.antigravity', 'mcp_config.json');

  function readMcpConfig() {
    if (!existsSync(MCP_CONFIG_PATH)) {
      const dir = join(homedir(), '.antigravity');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(MCP_CONFIG_PATH, JSON.stringify({ mcpServers: {} }, null, 2));
    }
    return JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf-8'));
  }

  function writeMcpConfig(config) {
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  app.get('/v1/mcp/servers', (_req, res) => {
    try {
      const config = readMcpConfig();
      res.json({ servers: config.mcpServers || {} });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  app.post('/v1/mcp/servers', (req, res) => {
    try {
      const { name, command, args = [], env = {} } = req.body;
      if (!name || !command) {
        return res.status(400).json({
          error: { message: 'name and command are required', type: 'invalid_request_error' },
        });
      }

      const config = readMcpConfig();
      config.mcpServers[name] = { command, args, env };
      writeMcpConfig(config);

      res.json({ status: 'ok', server: name, config: config.mcpServers[name] });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  app.delete('/v1/mcp/servers/:name', (req, res) => {
    try {
      const { name } = req.params;
      const config = readMcpConfig();

      if (!config.mcpServers[name]) {
        return res.status(404).json({
          error: { message: `Server "${name}" not found`, type: 'not_found' },
        });
      }

      delete config.mcpServers[name];
      writeMcpConfig(config);

      res.json({ status: 'ok', removed: name });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  app.post('/v1/mcp/reload', async (_req, res) => {
    try {
      if (cdp.getPage()) {
        const page = cdp.getPage();
        // Try to open command palette and type MCP reload
        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        await page.keyboard.press('p');
        await page.keyboard.up('Shift');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.type('MCP: Reload', { delay: 30 });
        await new Promise(r => setTimeout(r, 300));
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 300));
        res.json({ status: 'ok', message: 'MCP reload command sent' });
      } else {
        res.json({ status: 'ok', message: 'Config saved. Restart Antigravity to apply.' });
      }
    } catch (err) {
      res.json({ status: 'ok', message: 'Config saved. Restart Antigravity to apply.', warning: err.message });
    }
  });

  // ── Session/Conversation Management ───────────────────────────────

  app.post('/v1/conversations/new', async (_req, res) => {
    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected', type: 'service_unavailable' },
      });
    }

    try {
      await cdp.newConversation();
      res.json({ status: 'ok', message: 'New conversation started' });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  app.post('/v1/conversations/clear', async (_req, res) => {
    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected', type: 'service_unavailable' },
      });
    }

    try {
      await cdp.newConversation();
      res.json({ status: 'ok', message: 'Conversation cleared' });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  app.get('/v1/conversations/status', async (_req, res) => {
    if (!cdp.getPage()) {
      return res.status(503).json({
        error: { message: 'CDP not connected', type: 'service_unavailable' },
      });
    }

    try {
      const status = await cdp.getConversationStatus();
      res.json({ status: 'ok', ...status });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── Agent Manager Endpoints ──────────────────────────────────────────

  // GET /v1/agents — List all active agent sessions
  app.get('/v1/agents', async (_req, res) => {
    try {
      const agents = await cdp.listAgents();
      const result = agents.map(a => ({
        id: a.id,
        title: a.title,
        status: 'active',
      }));
      res.json({ agents: result });
    } catch (err) {
      console.log(`[api] List agents error: ${err.message}`);
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // POST /v1/agents/spawn — Spawn a new agent conversation
  app.post('/v1/agents/spawn', async (req, res) => {
    const { prompt, model, mode, workspace } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: { message: 'prompt is required', type: 'invalid_request_error' },
      });
    }

    const mgr = cdp.getManagerPage();
    if (!mgr) {
      return res.status(503).json({
        error: { message: 'Manager page not connected. Ensure Antigravity Manager window is open.', type: 'service_unavailable' },
      });
    }

    try {
      await enqueue(async () => {
        // Snapshot existing agent IDs so we can detect the new one
        const existingAgents = await cdp.listAgents();
        const existingIds = existingAgents.map(a => a.id);

        // Click "Start new conversation" in Manager sidebar
        await cdp.clickStartNewConversation();

        // Wait for the input to be ready on the Manager page
        await new Promise(r => setTimeout(r, 1000));

        // Select model if specified
        if (model) {
          const resolvedModel = cdp.resolveModel(model);
          try {
            // Temporarily operate on manager page for model selection
            await mgr.bringToFront();
            await new Promise(r => setTimeout(r, 200));
            // Use evaluate to click model dropdown on manager page
            await mgr.evaluate((bgClass, targetLabel) => {
              // Open dropdown
              const containers = document.querySelectorAll(`.${bgClass}`);
              for (const container of containers) {
                const text = container.innerText?.trim();
                if (text && (text.includes('Claude') || text.includes('Gemini') ||
                    text.includes('GPT') || text.includes('Opus') ||
                    text.includes('Sonnet') || text.includes('Flash'))) {
                  const clickable = container.querySelector('[role="button"], button') || container;
                  clickable.click();
                  break;
                }
              }
            }, 'bg-ide-chat-background', resolvedModel);
            await new Promise(r => setTimeout(r, 400));

            // Click the model option
            await mgr.evaluate((targetLabel) => {
              function matches(text, label) {
                if (!text) return false;
                const t = text.toLowerCase();
                const l = label.toLowerCase();
                if (t.includes(l)) return true;
                const words = l.split(/\s+/).filter(Boolean);
                return words.length > 0 && words.every(w => t.includes(w));
              }
              const candidates = document.querySelectorAll(
                '[role="option"], [role="menuitem"], [role="listbox"] > *'
              );
              for (const el of candidates) {
                const text = el.innerText?.trim();
                if (matches(text, targetLabel)) { el.click(); return; }
              }
            }, resolvedModel);
            await new Promise(r => setTimeout(r, 300));
          } catch (err) {
            console.log(`[api] Model selection on manager warning: ${err.message}`);
          }
        }

        // Select mode if specified
        if (mode) {
          try {
            const buttonLabel = mode.toLowerCase() === 'planning' ? 'Planning' : 'Fast';
            await mgr.evaluate((label) => {
              const all = document.querySelectorAll('button, [role="button"], div[class*="cursor-pointer"], span');
              for (const el of all) {
                const text = el.textContent?.trim();
                if (text === label || text === label.toLowerCase()) {
                  el.click();
                  return true;
                }
              }
              return false;
            }, buttonLabel);
            await new Promise(r => setTimeout(r, 200));
          } catch (err) {
            console.log(`[api] Mode selection on manager warning: ${err.message}`);
          }
        }

        // Type the prompt and send
        await cdp.typeAndSendOnPage(mgr, prompt);

        // Check if a new agent page appeared (workspace-based agents)
        let newAgent;
        try {
          newAgent = await cdp.waitForNewAgentPage(existingIds, 5000);
        } catch {
          newAgent = null;
        }

        if (newAgent) {
          res.json({ agent_id: newAgent.id, status: 'started', title: newAgent.title });
        } else {
          // Conversation is running in the Manager panel (normal behavior)
          res.json({ agent_id: 'manager', status: 'started', message: 'Prompt sent to Manager panel.' });
        }
      });
    } catch (err) {
      console.error(`[api] Spawn agent error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err.message, type: 'server_error' } });
      }
    }
  });

  // GET /v1/agents/:id/status — Get agent status
  app.get('/v1/agents/:id/status', async (req, res) => {
    const { id } = req.params;
    try {
      const agentPage = await cdp.findAgentPage(id);
      if (!agentPage) {
        return res.status(404).json({
          error: { message: `Agent "${id}" not found`, type: 'not_found' },
        });
      }

      const status = await cdp.getAgentStatus(agentPage);
      const { content: lastMessage } = await cdp.extractResponseFromPage(agentPage);

      res.json({
        id,
        status,
        lastMessage: lastMessage ? lastMessage.slice(0, 500) : null,
      });
    } catch (err) {
      console.log(`[api] Agent status error: ${err.message}`);
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // POST /v1/agents/:id/message — Send a follow-up message to an agent
  app.post('/v1/agents/:id/message', async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        error: { message: 'content is required', type: 'invalid_request_error' },
      });
    }

    try {
      const agentPage = await cdp.findAgentPage(id);
      if (!agentPage) {
        return res.status(404).json({
          error: { message: `Agent "${id}" not found`, type: 'not_found' },
        });
      }

      await enqueue(async () => {
        await cdp.typeAndSendOnPage(agentPage, content);
        res.json({ status: 'sent' });
      });
    } catch (err) {
      console.log(`[api] Agent message error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err.message, type: 'server_error' } });
      }
    }
  });

  // GET /v1/agents/:id/response — Get the latest response from an agent
  app.get('/v1/agents/:id/response', async (req, res) => {
    const { id } = req.params;
    try {
      const agentPage = await cdp.findAgentPage(id);
      if (!agentPage) {
        return res.status(404).json({
          error: { message: `Agent "${id}" not found`, type: 'not_found' },
        });
      }

      const result = await cdp.extractResponseFromPage(agentPage);
      res.json({
        id,
        content: result.content || null,
        thinking: result.thinking || null,
      });
    } catch (err) {
      console.log(`[api] Agent response error: ${err.message}`);
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // DELETE /v1/agents/:id — Close/stop an agent session
  app.delete('/v1/agents/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const agentPage = await cdp.findAgentPage(id);
      if (!agentPage) {
        return res.status(404).json({
          error: { message: `Agent "${id}" not found`, type: 'not_found' },
        });
      }

      // Close the agent's page
      await agentPage.close();
      res.json({ id, status: 'closed' });
    } catch (err) {
      console.log(`[api] Agent delete error: ${err.message}`);
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  });

  // ── Catch-all ───────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: { message: 'Not found', type: 'invalid_request_error' } });
  });

  function start() {
    return app.listen(listenPort, '0.0.0.0', () => {
      console.log(`[api] Listening on http://0.0.0.0:${listenPort}`);
      console.log(`[api]   POST /v1/chat/completions  (model, mode, auto_approve, stream, files)`);
      console.log(`[api]   GET  /v1/models`);
      console.log(`[api]   POST /v1/mode             (planning|fast)`);
      console.log(`[api]   POST /v1/auto-approve     (enabled: true|false)`);
      console.log(`[api]   GET  /v1/mcp/servers`);
      console.log(`[api]   POST /v1/mcp/servers`);
      console.log(`[api]   DELETE /v1/mcp/servers/:name`);
      console.log(`[api]   POST /v1/mcp/reload`);
      console.log(`[api]   POST /v1/conversations/new`);
      console.log(`[api]   POST /v1/conversations/clear`);
      console.log(`[api]   GET  /v1/conversations/status`);
      console.log(`[api]   GET  /v1/agents`);
      console.log(`[api]   POST /v1/agents/spawn`);
      console.log(`[api]   GET  /v1/agents/:id/status`);
      console.log(`[api]   POST /v1/agents/:id/message`);
      console.log(`[api]   GET  /v1/agents/:id/response`);
      console.log(`[api]   DELETE /v1/agents/:id`);
      console.log(`[api]   GET  /health`);
    });
  }

  return { app, start };
}

export { createServer };
