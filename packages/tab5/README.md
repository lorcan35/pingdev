# TinkerClaw Tab5

ESP32-P4 firmware for the M5Stack Tab5 — a 5" touchscreen that serves as the live browser remote for Dragon Q6A.

**What it does:** Tab5 connects to Dragon over WiFi, streams the browser display as MJPEG video, and forwards touch events back as mouse clicks via WebSocket → Chrome DevTools Protocol. You see the browser on Tab5, you tap on Tab5, the browser clicks.

## Hardware

- **Board:** M5Stack Tab5
- **SoC:** ESP32-P4 (360MHz dual-core RISC-V, 32MB PSRAM, 16MB flash)
- **Display:** 720x1280 MIPI DSI, ST7123 TDDI panel, 2-lane @ 965 Mbps
- **Touch:** ST7123 capacitive (I2C 0x55, integrated TDDI), 10-point multitouch
- **WiFi:** ESP32-C6 co-processor via SDIO (4-bit @ 40MHz, ESP-Hosted 1.4.0)
- **IO Expanders:** 2x PI4IOE5V6416 (I2C 0x43/0x44) — LCD/touch reset, WiFi power, charging
- **SD Card:** 128GB via SDMMC (4-bit)
- **Backlight:** GPIO 22, LEDC PWM @ 5kHz
- **HW JPEG Decoder:** ESP32-P4 built-in, decodes MJPEG frames directly to DPI framebuffer

## Architecture

```
┌─────────────┐     WiFi (MJPEG)      ┌──────────────────┐     CDP WebSocket     ┌──────────┐
│   Tab5      │ ◄──────────────────── │  Dragon Server   │ ◄────────────────── │ Chromium  │
│  ESP32-P4   │     WiFi (WS touch)   │  (dragon_server) │     Mouse events     │ (port     │
│  720x1280   │ ────────────────────► │  port 3501       │ ────────────────────► │  9222)    │
└─────────────┘                       └──────────────────┘                       └──────────┘
```

- **Tab5** pulls MJPEG from `http://dragon:3501/stream`, decodes with HW JPEG, displays on MIPI DSI
- **Tab5** sends touch as JSON via WebSocket to `ws://dragon:3501/ws/touch`
- **Dragon Server** connects to Chromium CDP (`Page.startScreencast` for frames, `Input.dispatchMouseEvent` for touch)
- Browser viewport is forced to 720x1280 portrait via `Emulation.setDeviceMetricsOverride`

## Prerequisites

### ESP-IDF (for building Tab5 firmware)

```bash
# Install ESP-IDF v5.5+
mkdir -p ~/esp && cd ~/esp
git clone --recursive https://github.com/espressif/esp-idf.git -b v5.5
cd esp-idf
./install.sh esp32p4
source export.sh
```

### Dragon Q6A Setup

```bash
# SSH into Dragon
ssh radxa@192.168.1.89  # default password: radxa

# Install Python dependencies for the streaming server
pip3 install --break-system-packages aiohttp

# Ensure Chromium is running with CDP enabled
# The snap Chromium on Dragon already uses --remote-debugging-port=9222
```

### Network

- Dragon Q6A: `192.168.1.89` (static recommended)
- Tab5 gets IP via DHCP (typically `192.168.1.90`)
- Both must be on the same WiFi network

## Build & Flash Tab5

```bash
# Source ESP-IDF
source ~/esp/esp-idf/export.sh

# Navigate to Tab5 package
cd packages/tab5

# Set target (first time only)
idf.py set-target esp32p4

# Configure WiFi and Dragon IP (optional — defaults in sdkconfig.defaults)
idf.py menuconfig
# → Tab5 Configuration → WiFi SSID, Password, Dragon Host, Dragon Port

# Build
idf.py build

# Flash (Tab5 connected via USB-C)
python -m esptool --chip esp32p4 -p /dev/ttyACM0 -b 460800 \
  --before default_reset --after no_reset \
  write_flash --flash_mode dio --flash_size 16MB --flash_freq 80m \
  0x2000 build/bootloader/bootloader.bin \
  0x8000 build/partition_table/partition-table.bin \
  0x10000 build/tinkerclaw-tab5.bin

# Monitor serial output (115200 baud)
idf.py -p /dev/ttyACM0 monitor
# Or: python -m serial.tools.miniterm /dev/ttyACM0 115200
```

**Note:** After flashing with `--after no_reset`, press the reset button on Tab5 or toggle DTR to boot.

## Start Dragon Streaming Server

```bash
# On Dragon Q6A (via SSH)
ssh radxa@192.168.1.89

# Copy dragon_server.py to Dragon (from dev machine)
# scp packages/tab5/dragon_server.py radxa@192.168.1.89:/home/radxa/

# Start the server
python3 -u dragon_server.py

# Or run in background
nohup python3 -u dragon_server.py > /tmp/dragon_server.log 2>&1 &
```

The server will:
1. Connect to Chromium CDP on `127.0.0.1:9222`
2. Pick the first real web page target (prefers https:// pages)
3. Force viewport to 720x1280 portrait
4. Start screencast (JPEG frames)
5. Serve MJPEG at `http://0.0.0.0:3501/stream`
6. Accept touch WebSocket at `ws://0.0.0.0:3501/ws/touch`

**Status page:** `http://192.168.1.89:3501/` — shows connection status, frame count, FPS.

## Configuration

### WiFi & Dragon (sdkconfig.defaults)

```
CONFIG_TAB5_WIFI_SSID="YourSSID"
CONFIG_TAB5_WIFI_PASS="YourPassword"
CONFIG_TAB5_DRAGON_HOST="192.168.1.89"
CONFIG_TAB5_DRAGON_PORT=3501
```

### Dragon Server (dragon_server.py)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3501` | Server port |
| `CDP_HOST` | `127.0.0.1` | Chrome CDP host |
| `CDP_PORT` | `9222` | Chrome CDP port (18800 on desktop) |
| `SCREENCAST_QUALITY` | `60` | JPEG quality (0-100) |
| `SCREENCAST_MAX_W` | `720` | Max frame width |
| `SCREENCAST_MAX_H` | `1280` | Max frame height |

### ESP-Hosted SDIO (P4 → C6)

| Signal | GPIO | Description |
|--------|------|-------------|
| CLK | 12 | SDIO clock |
| CMD | 13 | SDIO command |
| D0 | 11 | SDIO data 0 |
| D1 | 10 | SDIO data 1 |
| D2 | 9 | SDIO data 2 |
| D3 | 8 | SDIO data 3 |
| RST | 15 | C6 reset (active low) |

## Boot Sequence

1. **I2C init** → Scan bus (finds 0x43, 0x44, 0x55)
2. **IO expanders** → Reset display + touch, enable WiFi power (C6 co-processor)
3. **MIPI DSI display** → ST7123 init, blue fill = "booting"
4. **HW JPEG decoder** → Initialize `esp_driver_jpeg`
5. **Touch** → ST7123 TDDI at I2C 0x55
6. **WiFi** → ESP-Hosted SDIO link to C6, yellow fill = "connecting"
7. **WiFi connected** → Green fill, get IP
8. **MJPEG stream** → Connect to `http://dragon:3501/stream`, decode + display
9. **WebSocket touch** → Connect to `ws://dragon:3501/ws/touch`, forward taps
10. **Touch poll task** → 50Hz polling on core 1

## Serial Commands

| Command | Action |
|---------|--------|
| `info` | Chip info, heap, PSRAM, WiFi/touch status |
| `heap` | Free heap + PSRAM |
| `wifi` | WiFi status, Dragon connection, WebSocket status |
| `stream` | MJPEG FPS counter |
| `touch` | 5-second touch test (prints coordinates) |
| `touchdiag` | Raw register diagnostics + verbose polling |
| `scan` | I2C bus scan |
| `red` / `green` / `blue` / `white` / `black` | Fill screen |
| `bright <0-100>` | Set backlight brightness |
| `pattern [0-3]` | Display test patterns |
| `reboot` | Restart device |

## Source Files

### Tab5 Firmware (`main/`)

| File | Description |
|------|-------------|
| `main.c` | Boot sequence, serial command loop, touch poll task |
| `config.h` | Pin definitions, display timing, network config |
| `display.c` | MIPI DSI init, ST7123 panel, fill/pattern, HW JPEG decode |
| `display.h` | Display API |
| `touch.c` | ST7123 TDDI touch driver, diagnostics |
| `touch.h` | Touch API + point struct |
| `wifi.c` | ESP-Hosted WiFi STA init + connection |
| `wifi.h` | WiFi API |
| `mjpeg_stream.c` | HTTP MJPEG client, frame parser, display pipeline |
| `mjpeg_stream.h` | MJPEG API |
| `touch_ws.c` | WebSocket client for touch forwarding to Dragon |
| `touch_ws.h` | Touch WS API |
| `io_expander.c` | PI4IOE5V6416 I2C driver for power/reset control |
| `io_expander.h` | IO expander API |
| `esp_lcd_st7123.c` | ST7123 LCD panel driver |
| `Kconfig.projbuild` | menuconfig entries for WiFi/Dragon config |

### Dragon Server

| File | Description |
|------|-------------|
| `dragon_server.py` | CDP bridge: screencast → MJPEG + touch → mouse events |

## Dependencies

### ESP-IDF Components (managed)

| Component | Version | Purpose |
|-----------|---------|---------|
| `esp_lcd_touch_st7123` | ≥1.0.0 | ST7123 TDDI touch driver |
| `espressif/esp_hosted` | 1.4.0 | WiFi via ESP32-C6 SDIO |
| `espressif/esp_wifi_remote` | 0.8.5 | WiFi API bridge to C6 |

### ESP-IDF Built-in

`esp_lcd`, `esp_psram`, `driver`, `nvs_flash`, `esp_system`, `heap`, `esp_mm`, `esp_timer`, `esp_wifi`, `esp_netif`, `esp_event`, `esp_http_client`, `tcp_transport`, `json`, `esp_driver_jpeg`

### Dragon Server (Python)

```
aiohttp>=3.13
```

## Troubleshooting

**Tab5 shows green screen but no browser:**
- Check Dragon server is running: `curl http://192.168.1.89:3501/`
- Ensure Chromium has a real web page open (not just chrome://newtab)
- Check Tab5 serial: `stream` command shows MJPEG FPS

**Touch events don't click:**
- Verify WebSocket connected: Tab5 serial `wifi` command
- Check Dragon logs: `tail /tmp/dragon_server.log` should show `[TOUCH]` lines
- Auto-release timer is 150ms — quick taps work, verify on Dragon server logs

**WiFi won't connect:**
- ESP32-C6 needs power via IO expander (happens automatically in boot)
- Check SSID/password in sdkconfig: `grep TAB5_WIFI sdkconfig`
- Double boot is normal (PSRAM timing calibration triggers reset)

**No CDP targets on Dragon:**
- Ensure Chromium is running: `pgrep chromium`
- Check CDP: `curl http://127.0.0.1:9222/json`
- Chromium snap on Dragon uses port 9222 by default

## Phase Roadmap

- [x] **Phase 1.5** — MIPI DSI display, I2C, IO expanders, serial commands
- [x] **Phase 2** — Touch input (ST7123), WiFi (ESP-Hosted), MJPEG streaming, touch forwarding
- [ ] **Phase 3** — TinkerTab OS: Launcher, Chat PingApp, App Gallery, Settings
- [ ] **Phase 4** — Voice input (Moonshine STT), ANNOTATE mode, AI suggestion bar
