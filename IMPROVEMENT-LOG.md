\n## 2026-02-16
- Read target files: self-heal.(js|ts), gateway dist, extension background/content/types.
- Findings:
  - self-heal prompt is too vague; getDomExcerpt uses eval payload {code}; DOM cleaner strips all data-* and many attrs; needs smarter attribute whitelisting + hash-like class stripping per spec.
  - Extension background currently uses storage-driven manual share; has share_update message but does not send on tab close; lacks auto-share on startup/onCreated/onUpdated.
  - content.ts click is basic querySelector+click; eval currently uses command.code||command.expression but types.ts only defines code (type mismatch).
- Next: implement Fixes 1-5 + add std/src/protocol.ts, then run build/tsc/vitest.
- Additional findings:
  - std gateway dist references healResult.reasoning but self-heal result type currently omits it.
  - std/ext-bridge forwards eval payload fields verbatim; background and content already attempt code/expression dual support but TS types are inconsistent.
  - ExtensionBridge supports share_update; gateway uses it.
- Implemented Fix 1 (partial):
  - std/src/self-heal.ts: upgraded prompt (includes WEBSITE URL), added reasoning to HealResult, eval payload now uses canonical {expression}, getDomExcerpt now returns {url, html} with DOM cleaned in-page (attribute whitelist, strip generated classes, strip data-* except allowed, prune whitespace nodes).
  - std/src/self-heal.js: mirrored changes + reasoning field + expression payload.
- Implemented Fix 3 (partial): added std/src/protocol.ts with canonical wire protocol types.
- Extension: updated chrome-extension/src/types.ts eval command to support expression (canonical) + code fallback.

## Updated Plan (00:35)
- ORIGINAL FIXES 1-5 + NEW FIX 6 (Stealth)
- Fix 1: Smarter self-heal prompt + improved DOM extraction
- Fix 2: Auto-share ALL tabs on startup/create/update
- Fix 3: Create protocol.ts with canonical types
- Fix 4: Gateway reconnect resilience (re-send hello, re-inject scripts)
- Fix 5: Click selector improvement (text= prefix support)
- Fix 6: Stealth module (human typing, clicking, anti-fingerprinting, timing jitter)

Starting implementation...
- Implemented Fix 5 (content.ts): smarter click
  - Added support for selector prefix text=..., plus fallback text matching when CSS selector fails.
  - Prefers visible clickable candidates (button/a/role=button/etc), scrollIntoView before clicking.
  - Eval now prefers command.expression over command.code.
- Implemented Fix 2/4 (background.ts): auto-share all tabs + reconnect self-heal
  - Added manualUnsharedTabs state to preserve popup manual unshare overrides.
  - Added syncSharedTabsWithAllTabs(): shares all http/https tabs by default, injects content scripts, debounced hello updates.
  - Added tabs.onCreated/onUpdated/onRemoved auto-share/unshare + send hello on changes.
  - On WebSocket reconnect/open: resync shares + reinject + send hello.
- Build/QA:
  - chrome-extension: npm run build ✅
  - std: npx tsc ✅
  - std: npx vitest run ✅ (patched gateway.test.ts to use ephemeral port to avoid EADDRINUSE)
