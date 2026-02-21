const fs = require('fs');
const path = require('path');

function findFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, fileList);
    } else if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  let purpose = 'No specific documentation found.';
  const jsDocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
  if (jsDocMatch && jsDocMatch.index < 500) {
    purpose = jsDocMatch[1].replace(/\*/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' ');
  } else {
    const lineCommentMatch = content.match(/^(\/\/.*?\n)+/m);
    if (lineCommentMatch && lineCommentMatch.index < 100) {
        purpose = lineCommentMatch[0].replace(/\/\//g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' ');
    }
  }
  if (!purpose || purpose.trim() === '') purpose = 'Internal module.';

  const exports = [];
  const exportRegex = /export\s+(const|let|var|function|class|interface|type)\s+([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    exports.push(`${match[1]} ${match[2]}`);
  }
  if (content.includes('export default')) {
      exports.push('default export');
  }

  const dependencies = [];
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(content)) !== null) {
    if (!dependencies.includes(match[1])) {
        dependencies.push(match[1]);
    }
  }

  let architectureFit = 'Part of the internal utilities.';
  if (filePath.includes('chrome-extension')) {
    architectureFit = 'Data plane: executes operations within the browser context and handles DOM manipulation/CDP bridging.';
  } else if (filePath.includes('std/src/gateway')) {
    architectureFit = 'Control plane: The primary HTTP server that routes client requests to connected devices or AI drivers.';
  } else if (filePath.includes('std/src')) {
    architectureFit = 'Core Gateway component providing services, caching, or logic for web automation.';
  } else if (filePath.includes('cli/src')) {
    architectureFit = 'Management interface: Provides CLI commands for developers to manage the gateway and interact with devices.';
  } else if (filePath.includes('mcp-server/src')) {
    architectureFit = 'AI Assistant Integration: Exposes PingOS capabilities via the Model Context Protocol to clients like Claude Desktop.';
  }

  return { purpose, exports, dependencies, architectureFit };
}

function generateMarkdown() {
  let md = `# PingOS Codebase Deep Dive\n\n`;
  
  md += `## 1. Architectural Overview & Data Flow\n`;
  md += `**PingOS** turns the web into a programmable API using an ahead-of-time web-to-API compilation model.\n\n`;
  md += `### Data Flow Diagram\n`;
  md += `\`\`\`mermaid\n`;
  md += `graph TD\n`;
  md += `    Client[Client/cURL/SDK/Agent] -->|HTTP POST /v1/dev/:device/read| Gateway[Gateway Server :3500]\n`;
  md += `    Gateway -->|Resolves Device| Bridge[Extension Bridge]\n`;
  md += `    Bridge -->|WebSocket Message| ExtBG[Extension Background Script]\n`;
  md += `    ExtBG -->|chrome.tabs.sendMessage| ExtCS[Extension Content Script]\n`;
  md += `    ExtCS -->|DOM manipulation/Query| TargetTab[Target Browser Tab]\n`;
  md += `    TargetTab -->|Data/Result| ExtCS\n`;
  md += `    ExtCS -->|Response| ExtBG\n`;
  md += `    ExtBG -->|WebSocket| Bridge\n`;
  md += `    Bridge -->|HTTP Response| Gateway\n`;
  md += `    Gateway -->|JSON Data| Client\n`;
  md += `\`\`\`\n\n`;

  md += `### The Onboarding Story\n`;
  md += `1. **Installation**: A user clones the repo and runs \`npm install\` & \`npm run build\`.\n`;
  md += `2. **Startup**: The user runs \`npx pingos up\`. This starts the gateway server (Fastify) on port 3500 and launches a Chrome instance with the MV3 extension loaded.\n`;
  md += `3. **Discovery**: The user shares a tab via the extension popup. The tab connects to the gateway via WebSocket, registering a \`deviceId\` (e.g., \`chrome-123\`).\n`;
  md += `4. **Execution**: The user sends HTTP requests to the gateway (\`curl -X POST http://localhost:3500/v1/dev/chrome-123/extract\`).\n`;
  md += `5. **Automation**: Users can generate 'PingApps' (compiled website drivers) so that subsequent interactions use cached selectors instead of LLM inference.\n\n`;

  md += `### Key Configuration Options & Environment Variables\n`;
  md += `- **\`PINGOS_PORT\`**: The port the gateway runs on (default: \`3500\`).\n`;
  md += `- **\`OPENROUTER_API_KEY\`**, **\`ANTHROPIC_API_KEY\`**, **\`OPENAI_API_KEY\`**: API keys for AI extraction and self-healing.\n`;
  md += `- **\`PINGOS_STORE_DIR\`**: Path to store cached configurations, PingApps, and pipelines (default: \`~/.pingos\` or \`.pingos/\`).\n`;
  md += `Configuration is centrally loaded in \`packages/std/src/config.ts\`.\n\n`;

  md += `### Key API Endpoints\n`;
  md += `- **\`GET /v1/health\`**: Gateway health status.\n`;
  md += `- **\`GET /v1/devices\`**: Lists connected browser tabs.\n`;
  md += `- **\`POST /v1/dev/:device/:op\`**: Generic device operation (e.g., \`extract\`, \`click\`, \`type\`, \`read\`).\n`;
  md += `- **\`POST /v1/pipelines/run\`**: Run a cross-tab data pipeline.\n`;
  md += `- **\`POST /v1/functions/:app/call\`**: Call a Tab-as-a-Function registered PingApp endpoint.\n\n`;

  md += `### Key Design Decisions & Patterns\n`;
  md += `- **Ahead-of-Time (AOT) Compilation**: Avoids LLM costs at runtime by pre-compiling site interaction flows.\n`;
  md += `- **Shadow DOM Piercing**: A custom \`>>>\` combinator ensures extraction works seamlessly across modern web components.\n`;
  md += `- **CDP Fallback**: When Content Security Policies block script execution or inline evaluation, operations automatically fall back to the Chrome DevTools Protocol via the background script.\n`;
  md += `- **Self-Healing Selectors**: If a selector fails at runtime, an LLM repairs it based on the current DOM context, and the fix is cached.\n\n`;

  md += `--- \n\n## 2. File-by-File Codebase Analysis\n\n`;

  const packages = [
    { name: 'Standard Library / Gateway (packages/std/src)', dir: 'packages/std/src' },
    { name: 'CLI Tools (packages/cli/src)', dir: 'packages/cli/src' },
    { name: 'MCP Server (packages/mcp-server/src)', dir: 'packages/mcp-server/src' },
    { name: 'Chrome Extension (packages/chrome-extension/src)', dir: 'packages/chrome-extension/src' }
  ];

  for (const pkg of packages) {
    md += `### ${pkg.name}\n\n`;
    const files = findFiles(pkg.dir);
    if (files.length === 0) {
      md += `*No TypeScript files found in this package.*\n\n`;
      continue;
    }

    files.sort();

    for (const file of files) {
      const { purpose, exports, dependencies, architectureFit } = parseFile(file);
      const relativePath = file;
      md += `#### \`${relativePath}\`\n`;
      md += `- **Purpose**: ${purpose}\n`;
      md += `- **Architecture Fit**: ${architectureFit}\n`;
      
      if (exports.length > 0) {
        md += `- **Key Exports**: \`${exports.join('`, `')}\`\n`;
      } else {
        md += `- **Key Exports**: (None or internal)\n`;
      }

      if (dependencies.length > 0) {
         md += `- **Dependencies**: \`${dependencies.join('`, `')}\`\n`;
      } else {
         md += `- **Dependencies**: (None)\n`;
      }
      md += `\n`;
    }
  }

  fs.writeFileSync('CODEBASE-DEEP-DIVE.md', md);
  console.log('Successfully generated CODEBASE-DEEP-DIVE.md');
}

generateMarkdown();