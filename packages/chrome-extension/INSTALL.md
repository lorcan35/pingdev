# Installation Guide

## Quick Start

### 1. Build the Extension

```bash
cd ~/projects/pingdev/packages/chrome-extension
npm install
npm run build
```

### 2. Load into Chrome

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select `~/projects/pingdev/packages/chrome-extension/dist/`

### 3. Start the Gateway

```bash
cd ~/projects/pingdev
npm run dev
```

The gateway will start on `http://localhost:3500` with WebSocket endpoint at `ws://localhost:3500/ext`.

### 4. Connect Extension

1. Click the PingOS Bridge extension icon in Chrome toolbar
2. You should see a green dot indicating connection to gateway
3. Toggle tabs you want to share with the gateway

### 5. Test the Bridge

Open a tab you've shared (e.g., tab ID 123) and try these commands:

```bash
# Click a button
curl -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#button-id"}'

# Type in an input field
curl -X POST http://localhost:3500/v1/dev/chrome-123/type \
  -H "Content-Type: application/json" \
  -d '{"selector": "input[name=\"search\"]", "text": "hello world"}'

# Read text from an element
curl -X POST http://localhost:3500/v1/dev/chrome-123/read \
  -H "Content-Type: application/json" \
  -d '{"selector": ".result-text"}'

# Extract structured data
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "price": ".price"}}'

# Execute JavaScript
curl -X POST http://localhost:3500/v1/dev/chrome-123/eval \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

## Troubleshooting

### Extension not connecting to gateway

- Check that gateway is running: `curl http://localhost:3500/v1/health`
- Check browser console (F12) → Extensions → PingOS Bridge → Service Worker → Console
- Look for WebSocket connection errors

### Commands not working

- Verify tab is shared (check extension popup)
- Verify tab ID is correct (visible in popup as `chrome-{tabId}`)
- Check content script is loaded (F12 → Console → look for "[Content] Bridge executor and recorder loaded")

### Build errors

- Clear node_modules: `rm -rf node_modules && npm install`
- Clear dist: `npm run clean && npm run build`

## Development

### Watch mode

```bash
npm run watch
```

Rebuilds on file changes. Reload extension in `chrome://extensions/` after each rebuild.

### Running tests

```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

### Create distributable package

```bash
npm run pack
```

Creates `extension.zip` ready for distribution or Chrome Web Store upload.

## Architecture Notes

The extension consists of three main components:

1. **Background Service Worker** (`background.js`)
   - Maintains WebSocket connection to gateway
   - Manages shared tab registry
   - Routes device requests to content scripts

2. **Content Script** (`content.js`)
   - Injected into all pages
   - Executes bridge commands (click, type, read, etc.)
   - Records user interactions for export

3. **Popup UI** (`popup.html` + `popup.js`)
   - Shows connection status
   - Allows toggling tab sharing
   - Exports recorded actions as PingApp code

## Next Steps

See [README.md](./README.md) for full API documentation and examples.
