/**
 * TinkerClaw Tab5 — Configuration
 *
 * WiFi, server, and display settings.
 * Override via menuconfig or sdkconfig.defaults.
 */
#pragma once

// ---------------------------------------------------------------------------
// WiFi
// ---------------------------------------------------------------------------
#ifndef TAB5_WIFI_SSID
#define TAB5_WIFI_SSID       CONFIG_TAB5_WIFI_SSID
#endif

#ifndef TAB5_WIFI_PASS
#define TAB5_WIFI_PASS       CONFIG_TAB5_WIFI_PASS
#endif

// ---------------------------------------------------------------------------
// Dragon streaming server
// ---------------------------------------------------------------------------
#ifndef TAB5_DRAGON_HOST
#define TAB5_DRAGON_HOST     CONFIG_TAB5_DRAGON_HOST
#endif

#ifndef TAB5_DRAGON_PORT
#define TAB5_DRAGON_PORT     CONFIG_TAB5_DRAGON_PORT
#endif

// Stream endpoint: GET /stream -> MJPEG
#define TAB5_STREAM_PATH     "/stream"

// Touch endpoint: WebSocket /ws/touch
#define TAB5_TOUCH_WS_PATH   "/ws/touch"

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
#define TAB5_DISPLAY_WIDTH   800
#define TAB5_DISPLAY_HEIGHT  480
#define TAB5_LCD_BPP         16   // RGB565

// ---------------------------------------------------------------------------
// MJPEG
// ---------------------------------------------------------------------------
#define TAB5_JPEG_BUF_SIZE   (100 * 1024)   // 100KB per JPEG frame
#define TAB5_FRAME_TIMEOUT_MS 5000           // Timeout waiting for a frame
