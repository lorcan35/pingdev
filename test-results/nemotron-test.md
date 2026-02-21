# Nemotron-3-Nano PingOS Test Results

Date: 2026-02-21
Model: nvidia/nemotron-3-nano via LM Studio (`http://localhost:1234/v1`)
Gateway: `http://localhost:3500`

## Phase 1 — Baseline Nemotron endpoint tests (local mode OFF)

### Device discovery
- Initial `GET /v1/devices`: no connected devices (`devices: []`).
- Chromium process with PingOS extension appears running, but gateway still reports no device.

(Checkpoint written before attempting Chromium restart/reconnect.)
