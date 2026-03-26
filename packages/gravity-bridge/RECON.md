# CDP Recon Results (2026-03-21)

## Connection
- CDP URL: http://127.0.0.1:9222
- Target: "workspace - Antigravity - auth●" (page ID: 2B5DE0410DF8D2BB41B63C02BCD292CA)
- Browser: Chrome/142.0.7444.175, Electron/39.2.3
- puppeteer-core connects fine via browserURL

## Agent Panel DOM

### Chat Input
- Element: `div[contenteditable]` with classes `max-h-[300px] rounded cursor-text overflow-y-auto text-md p-2 outline-none`
- Selector: `div.cursor-text[contenteditable]` or find by class containing "cursor-text"

### Send Button  
- Text: "Send"
- Classes: `flex items-center p-1 rounded-full transition-all duration-1`

### Model Selector
- NOT a select/combobox - it's a custom dropdown
- Models visible in DOM text: "Gemini 3.1 Pro (High)", "Gemini 3.1 Pro (Low)", "Gemini 3 Flash", "Claude Sonnet 4.6 (Thinking)", "Claude..."  
- Container classes include: `!border-0 bg-ide-chat-background`

### Mode Selector
- Button text: "Planning"
- Classes: `py-1 pl-1 pr-2 flex items-center gap-0.5 rounded-md`

### Response Messages
- "Thought for <1s" buttons indicate thinking responses
- Message container: `relative flex flex-col gap-8 text-ide-message-block-bot-color px-2`

### Voice Memo
- Button aria-label: "Record voice memo"

## Dependencies installed
- puppeteer-core, express, ws - all in node_modules
