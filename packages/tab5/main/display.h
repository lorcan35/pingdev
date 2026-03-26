/**
 * TinkerClaw Tab5 — Display driver
 *
 * MIPI DSI 720x1280 ILI9881C panel on M5Stack Tab5.
 */
#pragma once

#include "esp_err.h"
#include "driver/i2c_master.h"
#include <stdint.h>
#include <stddef.h>

/**
 * Initialize the MIPI DSI display.
 * Must call tab5_io_expander_init() first (handles LCD reset).
 */
esp_err_t tab5_display_init(void);

/** Fill entire screen with an RGB565 color. */
void tab5_display_fill_color(uint16_t color_rgb565);

/** Set backlight brightness (0-100%). */
esp_err_t tab5_display_set_brightness(int percent);

/** Show a status message (logged to serial). */
void tab5_display_show_status(const char *msg);
