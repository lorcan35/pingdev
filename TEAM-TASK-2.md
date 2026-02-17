# PingOS Agent Team Task — Phase 2

Create an agent team with 4 teammates. This repo is PingOS — a browser automation extension + gateway.

IMPORTANT: Read packages/chrome-extension/src/content.ts first to understand the existing ops (recon, act, extract, click, type, press, scroll, read, eval). The gateway is at packages/core/. The Python SDK is at packages/python-sdk/. The CLI is at packages/cli/.

## Teammate 1: ObserveOp
Build the `observe()` op in the chrome extension (content.ts + background.ts):
- observe() answers "What can I do on this page?" — returns a human-readable list of possible actions
- It runs recon internally and transforms the results into natural language
- Groups actions by purpose: navigation, forms/inputs, buttons/actions, links
- Returns: { actions: string[], forms: {name, fields}[], navigation: string[], summary: string }
- summary is a 1-2 sentence description of the page and what's possible
- Wire it up in background.ts message handler alongside the other ops
- Add it to the gateway route in packages/core/src/ops/ if an ops directory exists, otherwise add the route in the main server file
- Run npm run build in packages/chrome-extension — zero errors

## Teammate 2: FixCLI  
Fix bugs in packages/cli/pingos_cli/main.py:
- Add `observe` command: `pingos observe [DEVICE]` — calls the observe op, prints human-readable output
- The `--json` flag on the group isn't accessible in subcommands — fix it so `pingos --json devices` works
- Add color output using click.style for human-readable mode (green for success, yellow for warnings, cyan for titles)
- Add `pingos read SELECTOR [DEVICE]` command
- Test all commands work: devices, recon, act, extract, observe, read
- Fix: `pingos devices` should show a cleaner table with just ID, title (truncated to 40 chars), and domain (not full URL)

## Teammate 3: SDKPolish
Improve packages/python-sdk/:
- Add observe() method to Tab class
- Add read() fix (currently crashes on list response — handle both dict and list)
- Add Tab.wait(seconds) convenience method
- Add Browser.find(query) — searches tab titles/URLs, returns first matching Tab
- Add __repr__ for Tab: Tab(chrome-XXX "Page Title")
- Write more tests in tests/test_basic.py covering all ops
- Update README with full API reference

## Teammate 4: CommitAndDocs
After the other 3 teammates finish:
- Wait 2 minutes, then check if packages/chrome-extension builds clean
- Run the Python SDK tests: cd packages/python-sdk && python -m pytest tests/ -v
- Test the CLI: pingos --help, pingos devices, pingos observe chrome-2114771802
- Write a CHANGELOG.md entry for this release
- Git add all new files and commit: "feat: add observe op, Python SDK, CLI tool"
- Do NOT push

Dependencies: Teammate 4 is blocked by teammates 1, 2, 3.
All teammates: write to disk incrementally every 3-5 tool calls.
