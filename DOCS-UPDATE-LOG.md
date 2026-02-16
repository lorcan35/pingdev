# DOCS UPDATE LOG — Chrome Extension Auth Bridge

## 2026-02-15

### Context
- Chrome Extension Auth Bridge E2E verified:
  - `curl -X POST http://localhost:3500/v1/dev/chrome-2114771645/read -d '{"selector":"h1"}'`
  - Flow: HTTP API → Gateway (:3500) → WebSocket `/ext` → Chrome extension (MV3 background) → content script → DOM → response.

### Work plan
- Update root docs to treat the extension bridge as a first-class execution path alongside PingApps/CDP.
- Add API documentation for `/v1/dev/chrome-{tabId}/{op}` operations (`read|click|type|extract|eval`).
- Document WebSocket protocol at `/ext` (hello/share_update/device_request/device_response).
- Add driver documentation for “Chrome Extension (Authenticated Browser Tabs)” and explain how shared tabs become devices.
- Add changelog entry for Phase 2.
- Verify `packages/chrome-extension/README.md` and add troubleshooting.
- Create `packages/std/README.md` documenting the gateway + `ExtensionBridge` + routes/protocol.

### Updates (in progress)
- Updated `docs/API.md`
  - Added `POST /v1/dev/:device/:op` documentation
  - Added Chrome extension tab devices section (`chrome-{tabId}`) with working curl examples for `read|click|type|extract|eval`
  - Added WebSocket `/ext` protocol section (hello/share_update/device_request/device_response)
  - Added operational notes (timeouts/error mapping) for extension-backed ops
- Updated `docs/ARCHITECTURE.md`
  - Added Extension Bridge as a first-class component
  - Documented dual execution paths (PingApp/CDP vs Chrome extension authenticated tab)
  - Added a dedicated sequence diagram for the `/v1/dev/chrome-{tabId}/{op}` request lifecycle
  - Added explicit `/ext` WebSocket protocol section + device naming (`chrome-{tabId}`)
- Updated `docs/DRIVERS.md`
  - Added "Chrome Extension Driver (Authenticated Tabs)" section
  - Updated Table of Contents to include the new section
  - Documented how shared tabs become devices + supported ops + recorder → `defineSite()` flow
  - Added comparison table: PingApp (CDP) vs Extension-backed tabs (real browser)
- Updated `README.md`
  - Architecture diagram includes `ExtensionBridge` and extension components
  - Added Chrome Extension Auth Bridge overview + optional quick-start (build/load/share tab + curl test)
  - Added docs link to `packages/chrome-extension/README.md`
- Updated `CHANGELOG.md`
  - Added `0.2.0` entry for Phase 2 Chrome Extension Auth Bridge
- Updated `packages/chrome-extension/README.md`
  - Added troubleshooting section (disconnects, ENODEV, content script limitations, rebuild/reload)
- Created `packages/std/README.md`
  - Documented gateway + registry + adapters + ExtensionBridge routes/protocol
