/**
 * TinkerClaw Tab5 — Display driver (Phase 1)
 *
 * Phase 1: Basic RGB LCD initialization and solid color fills.
 * We probe for the LCD by trying common RGB panel configurations.
 *
 * The ESP32-P4 drives the LCD via its built-in LCD peripheral with
 * a parallel RGB interface (16-bit RGB565).
 */

#include "display.h"
#include "config.h"

#include <string.h>
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"

static const char *TAG = "tab5_display";

static uint16_t *s_framebuffer = NULL;
static esp_lcd_panel_handle_t s_panel = NULL;
static bool s_initialized = false;

esp_err_t tab5_display_init(void)
{
    ESP_LOGI(TAG, "Initializing %dx%d RGB LCD", TAB5_DISPLAY_WIDTH, TAB5_DISPLAY_HEIGHT);

    // Allocate framebuffer in PSRAM
    size_t fb_size = TAB5_DISPLAY_WIDTH * TAB5_DISPLAY_HEIGHT * sizeof(uint16_t);
    s_framebuffer = (uint16_t *)heap_caps_calloc(1, fb_size, MALLOC_CAP_SPIRAM);
    if (!s_framebuffer) {
        // Fallback to internal RAM if no PSRAM
        ESP_LOGW(TAG, "PSRAM alloc failed, trying internal RAM");
        s_framebuffer = (uint16_t *)heap_caps_calloc(1, fb_size, MALLOC_CAP_DEFAULT);
    }
    if (!s_framebuffer) {
        ESP_LOGE(TAG, "Failed to allocate framebuffer (%d bytes)", fb_size);
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "Framebuffer allocated: %d bytes", fb_size);

    // RGB panel configuration
    // Pin assignments will need to be adapted to the specific board
    // These are placeholder values — the actual pins depend on the PCB routing
    esp_lcd_rgb_panel_config_t panel_config = {
        .clk_src = LCD_CLK_SRC_DEFAULT,
        .timings = {
            .pclk_hz = 16 * 1000 * 1000,
            .h_res = TAB5_DISPLAY_WIDTH,
            .v_res = TAB5_DISPLAY_HEIGHT,
            .hsync_pulse_width = 4,
            .hsync_back_porch = 8,
            .hsync_front_porch = 8,
            .vsync_pulse_width = 4,
            .vsync_back_porch = 8,
            .vsync_front_porch = 8,
            .flags = {
                .pclk_active_neg = true,
            },
        },
        .data_width = 16,
        .num_fbs = 1,
        .bounce_buffer_size_px = TAB5_DISPLAY_WIDTH * 10,
        .flags = {
            .fb_in_psram = true,
        },
    };

    esp_err_t ret = esp_lcd_new_rgb_panel(&panel_config, &s_panel);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "RGB panel create failed: %s (pin config may need adjustment)", esp_err_to_name(ret));
        ESP_LOGW(TAG, "Running in framebuffer-only mode — serial commands still work");
        s_initialized = true;
        return ESP_OK;
    }

    ESP_ERROR_CHECK(esp_lcd_panel_reset(s_panel));
    ESP_ERROR_CHECK(esp_lcd_panel_init(s_panel));

    s_initialized = true;
    ESP_LOGI(TAG, "Display initialized successfully");
    return ESP_OK;
}

void tab5_display_fill_color(uint16_t color_rgb565)
{
    if (!s_initialized || !s_framebuffer) return;

    for (int i = 0; i < TAB5_DISPLAY_WIDTH * TAB5_DISPLAY_HEIGHT; i++) {
        s_framebuffer[i] = color_rgb565;
    }

    if (s_panel) {
        esp_lcd_panel_draw_bitmap(s_panel, 0, 0,
                                  TAB5_DISPLAY_WIDTH, TAB5_DISPLAY_HEIGHT,
                                  s_framebuffer);
    }

    ESP_LOGI(TAG, "Filled display with color 0x%04X", color_rgb565);
}

esp_err_t tab5_display_draw_jpeg(const uint8_t *jpeg_data, size_t jpeg_len)
{
    // Phase 2: JPEG decode + display
    ESP_LOGW(TAG, "JPEG display not implemented in Phase 1");
    return ESP_ERR_NOT_SUPPORTED;
}

void tab5_display_show_status(const char *msg)
{
    ESP_LOGI(TAG, "Status: %s", msg);
}
