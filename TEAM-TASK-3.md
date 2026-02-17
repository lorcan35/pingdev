# PingOS Agent Team — Fix Extension + Build PingApps

## CRITICAL CONTEXT
- The chrome extension content script is broken — `findElement()` gets called with non-string arguments causing "e.startsWith is not a function"
- Even basic ops like `recon` fail now
- The extension needs to be reloaded in the browser after fixing (navigate to chrome://extensions in the correct Chromium window and click reload on the Antigravity Browser Extension)
- Gateway runs at localhost:3500
- Extension source: packages/chrome-extension/src/content.ts
- The last working commit was b8ff2f0 — compare against current HEAD (9a18971) to find what broke

## Teammate 1: ExtensionFixer
1. `git diff b8ff2f0..HEAD -- packages/chrome-extension/src/content.ts` to see all changes
2. Find every call to `findElement()` and `handleClick()` and `handleRead()` — ensure the selector argument is ALWAYS a string, never an object
3. The switch statement in handleBridgeCommand may have duplicate cases or missing cases from the merge — audit it
4. Add `if (!selector || typeof selector !== 'string') return null;` as first line of findElement()  
5. Add similar guards to handleClick, handleRead, handleType — any function that takes a selector
6. `npm run build` in packages/chrome-extension — must be zero errors
7. Test by running: `curl -s -X POST http://localhost:3500/v1/dev/chrome-2114771795/recon -H "Content-Type: application/json" -d '{}'`
8. If recon still fails, the content script needs reinjection — open chrome://extensions in Chromium and click the reload ↻ icon on "Antigravity Browser Extension"
9. Test observe: `curl -s -X POST http://localhost:3500/v1/dev/chrome-2114771795/observe -H "Content-Type: application/json" -d '{}'`
10. Both must return real data (not empty, not errors)

## Teammate 2: PingAppArchitect
1. Create `projects/pingapps/` directory structure:
   ```
   projects/pingapps/
   ├── README.md          (what PingApps are, how to create one)
   ├── schema.json        (PingApp manifest schema)
   ├── youtube/
   │   ├── manifest.json  (name, description, url_pattern, user_stories, workflows)
   │   ├── workflows/
   │   │   ├── search-and-play.json
   │   │   └── extract-trending.json
   │   └── tests/
   │       └── test_youtube.py
   ├── reddit/
   │   ├── manifest.json
   │   ├── workflows/
   │   │   ├── browse-subreddit.json
   │   │   └── extract-top-posts.json
   │   └── tests/
   ├── gmail/
   │   ├── manifest.json
   │   ├── workflows/
   │   │   ├── check-inbox.json
   │   │   └── compose-email.json
   │   └── tests/
   ├── google-calendar/
   │   ├── manifest.json
   │   ├── workflows/
   │   │   ├── view-today.json
   │   │   └── create-event.json
   │   └── tests/
   └── amazon/
       ├── manifest.json
       ├── workflows/
       │   ├── search-product.json
       │   └── price-check.json
       └── tests/
   ```

2. Each manifest.json should contain:
   ```json
   {
     "name": "YouTube",
     "version": "0.1.0",
     "url_patterns": ["youtube.com/*"],
     "description": "Search, watch, and extract data from YouTube",
     "user_stories": [
       {
         "id": "yt-search",
         "as": "a user",
         "i_want": "to search for videos on a topic",
         "so_that": "I can find relevant content quickly",
         "workflow": "search-and-play"
       }
     ],
     "required_auth": false,
     "tags": ["video", "media", "search"]
   }
   ```

3. Each workflow JSON should contain a sequence of PingOS ops:
   ```json
   {
     "name": "search-and-play",
     "steps": [
       { "op": "act", "instruction": "click Search" },
       { "op": "act", "instruction": "type {{query}}" },
       { "op": "act", "instruction": "press Enter" },
       { "op": "extract", "schema": { "titles": "ytd-video-renderer #video-title", "views": "ytd-video-renderer #metadata-line span" } },
       { "op": "act", "instruction": "click {{titles[0]}}" }
     ],
     "inputs": { "query": { "type": "string", "description": "Search query" } },
     "outputs": { "titles": "array", "views": "array" }
   }
   ```

4. Write REAL user stories for all 5 sites based on how actual humans use them. Be specific and practical.

5. Write the README.md explaining the PingApp concept, how to create one, how to run one.

## Teammate 3: PingAppRunner
1. Create `packages/python-sdk/pingos/apps.py` — PingApp runner that:
   - Loads a PingApp manifest + workflow JSON
   - Executes the workflow steps in sequence using the existing Tab class
   - Handles template variables ({{query}}, {{titles[0]}})
   - Returns structured results
   - Has a `run_workflow(tab, workflow_path, inputs={})` function

2. Add CLI command: `pingos run <app> <workflow> [--input key=value]`
   Example: `pingos run youtube search-and-play --input query="ESP32 tutorial"`

3. Add `pingos apps` command to list available PingApps

4. Test the YouTube search-and-play workflow end-to-end against the live browser

Dependencies: Teammate 3 needs Teammate 1 to fix the extension first.
All teammates: write to disk incrementally.
