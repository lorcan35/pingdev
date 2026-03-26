# TinkerClaw Tab5

ESP32-P4 firmware for the M5Stack Tab5 — a 5" touchscreen that serves as the live browser remote for Dragon.

## Hardware

- **Board:** M5Stack Tab5
- **SoC:** ESP32-P4 (360MHz dual-core RISC-V, 32MB PSRAM, 16MB flash)
- **Display:** 720x1280 MIPI DSI, ILI9881C panel, 2-lane @ 730 Mbps
- **Touch:** GT911 capacitive (I2C 0x14, INT=GPIO23)
- **WiFi:** ESP32-C6 co-processor via SDIO (4-bit, ESP-Hosted)
- **IO Expanders:** 2x PI4IOE5V6416 (I2C 0x43/0x44) — LCD/touch reset, WiFi power, charging
- **SD Card:** 128GB via SDMMC (4-bit)
- **Backlight:** GPIO 22, LEDC PWM @ 5kHz

## Build

Requires ESP-IDF v5.5+.

```bash
source $IDF_PATH/export.sh
cd packages/tab5
idf.py set-target esp32p4
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

## Serial Commands

| Command | Action |
|---------|--------|
| `info` | Show chip info, heap, PSRAM |
| `heap` | Show memory stats |
| `red` / `green` / `blue` / `white` / `black` | Fill screen with color |
| `bright <0-100>` | Set backlight brightness |

## Phase Roadmap

- [x] **Phase 1.5** — MIPI DSI display, I2C, IO expanders, serial commands
- [ ] **Phase 2** — Touch input (GT911), WiFi (ESP-Hosted), Dragon connection
- [ ] **Phase 3** — MJPEG streaming from Dragon, touch forwarding
- [ ] **Phase 4** — AI overlay, on-device status UI
