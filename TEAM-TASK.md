# PingOS Agent Team Task

Create an agent team with 3 teammates:

## Teammate 1: FuzzyFixer
Fix packages/chrome-extension/src/content.ts:
- In scanPageActions, links without id/aria-label fall back to bare 'a' selector (useless on pages with 100s of links). Line ~578 has a partial fix with href-based selectors — apply the SAME fix to the second occurrence at line ~1059.
- In parseActInstruction, change `bestScore > 0` to `bestScore >= 10`
- After fixing, run: cd packages/chrome-extension && npm run build
- Zero TS errors required.

## Teammate 2: PythonSDK
Build packages/python-sdk/ from scratch:
- pingos/client.py: GatewayClient(host, port) with _request() method
- pingos/browser.py: Browser class, Tab class with recon(), act(instruction), extract(schema), click(selector), type(text), press(key), scroll(direction, amount), read(selector)
- pingos/__init__.py: export Browser, Tab
- setup.py: pip-installable as "pingos"
- README.md with real usage examples
- tests/test_basic.py

## Teammate 3: CLITool  
Build packages/cli/ from scratch:
- pingos_cli/main.py using click
- Commands: devices, recon, act, extract, screenshot
- Auto-detect device if only one connected
- Human-readable default output, --json flag for machine output
- setup.py: pip-installable as "pingos-cli" with `pingos` entry point

All teammates: write to disk incrementally, don't wait until the end.
