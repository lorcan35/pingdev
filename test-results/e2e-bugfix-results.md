# PingOS E2E Bugfix Test Results
Run: Sat Feb 21 01:45:13 AM +04 2026

- **Device:** `chrome-726392682`

{
  "actionCount": 2,
  "types": [
    "navigate",
    "extract"
  ]
}
### Bug#1 Recorder captures API actions
- **Status:** PASS
- **Detail:** actions=2, navigate=true, extract=true

{
  "actionCount": 0,
  "warning": "No actions captured during recording. API-driven actions (navigate, extract, etc.) are captured automatically. For browser interactions, perform them directly in Chrome while recording is active."
}
### Bug#2 Empty export warning
- **Status:** PASS
- **Detail:** actionCount=0, warning=No actions captured during recording. API-driven actions (navigate, extract, etc.) are captured automatically. For browser interactions, perform them directly in Chrome while recording is active.

### Bug#3 Recordings persist
- **Status:** PASS
- **Detail:** saved=2, hasNonZero=true

{
  "ok": true,
  "successCount": 2,
  "steps": 2
}
### Bug#4 Replay by ID
- **Status:** PASS
- **Detail:** recordingId=recording-1771623916327, replayed=2

Requesting 3: [
  3,
  3,
  3
]
Requesting 7: [
  7,
  7,
  7
]
### Bug#6 Query count limiting
- **Status:** PASS
- **Detail:** 3→[
  3,
  3,
  3
], 7→[
  7,
  7,
  7
]

selector format: ok=true step=ok
text format: ok=true step=ok
### Bug#8 Pipeline read params
- **Status:** PASS
- **Detail:** selector=ok, text=ok

### Bug#5 Watch schema endpoint
- **Status:** PASS
- **Detail:** http=200timeout


## Summary: 7 PASS / 0 FAIL
