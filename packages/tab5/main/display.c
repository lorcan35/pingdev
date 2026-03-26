/**
 * TinkerClaw Tab5 — MIPI DSI Display Driver
 *
 * Drives the 720x1280 ILI9881C panel via 2-lane MIPI DSI on ESP32-P4.
 * Based on M5Stack Tab5 BSP display initialization.
 *
 * Init sequence:
 *   1. Backlight PWM setup (GPIO 22)
 *   2. MIPI DSI PHY power via LDO channel 3
 *   3. Create DSI bus (2 lanes, 730 Mbps)
 *   4. Create DBI IO for commands
 *   5. Create ILI9881C panel with vendor init data
 *   6. Reset, init, turn on
 */

#include "display.h"
#include "config.h"

#include <string.h>
#include "esp_log.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_ili9881c.h"
#include "esp_ldo_regulator.h"
#include "driver/ledc.h"

static const char *TAG = "tab5_display";

static esp_lcd_dsi_bus_handle_t s_dsi_bus = NULL;
static esp_lcd_panel_io_handle_t s_panel_io = NULL;
static esp_lcd_panel_handle_t s_panel = NULL;
static bool s_initialized = false;

#define LCD_LEDC_CH LEDC_CHANNEL_1

// ---------------------------------------------------------------------------
// ILI9881C vendor init commands — from M5Stack BSP
// ---------------------------------------------------------------------------
static const ili9881c_lcd_init_cmd_t s_ili9881c_init_cmds[] = {
    // CMD_Page 1 — set 2 lanes
    {0xFF, (uint8_t[]){0x98, 0x81, 0x01}, 3, 0},
    {0xB7, (uint8_t[]){0x03}, 1, 0},
    // CMD_Page 3
    {0xFF, (uint8_t[]){0x98, 0x81, 0x03}, 3, 0},
    {0x01, (uint8_t[]){0x00}, 1, 0},
    {0x02, (uint8_t[]){0x00}, 1, 0},
    {0x03, (uint8_t[]){0x73}, 1, 0},
    {0x04, (uint8_t[]){0x00}, 1, 0},
    {0x05, (uint8_t[]){0x00}, 1, 0},
    {0x06, (uint8_t[]){0x08}, 1, 0},
    {0x07, (uint8_t[]){0x00}, 1, 0},
    {0x08, (uint8_t[]){0x00}, 1, 0},
    {0x09, (uint8_t[]){0x1B}, 1, 0},
    {0x0a, (uint8_t[]){0x01}, 1, 0},
    {0x0b, (uint8_t[]){0x01}, 1, 0},
    {0x0c, (uint8_t[]){0x0D}, 1, 0},
    {0x0d, (uint8_t[]){0x01}, 1, 0},
    {0x0e, (uint8_t[]){0x01}, 1, 0},
    {0x0f, (uint8_t[]){0x26}, 1, 0},
    {0x10, (uint8_t[]){0x26}, 1, 0},
    {0x11, (uint8_t[]){0x00}, 1, 0},
    {0x12, (uint8_t[]){0x00}, 1, 0},
    {0x13, (uint8_t[]){0x02}, 1, 0},
    {0x14, (uint8_t[]){0x00}, 1, 0},
    {0x15, (uint8_t[]){0x00}, 1, 0},
    {0x16, (uint8_t[]){0x00}, 1, 0},
    {0x17, (uint8_t[]){0x00}, 1, 0},
    {0x18, (uint8_t[]){0x00}, 1, 0},
    {0x19, (uint8_t[]){0x00}, 1, 0},
    {0x1a, (uint8_t[]){0x00}, 1, 0},
    {0x1b, (uint8_t[]){0x00}, 1, 0},
    {0x1c, (uint8_t[]){0x00}, 1, 0},
    {0x1d, (uint8_t[]){0x00}, 1, 0},
    {0x1e, (uint8_t[]){0x40}, 1, 0},
    {0x1f, (uint8_t[]){0x00}, 1, 0},
    {0x20, (uint8_t[]){0x06}, 1, 0},
    {0x21, (uint8_t[]){0x01}, 1, 0},
    {0x22, (uint8_t[]){0x00}, 1, 0},
    {0x23, (uint8_t[]){0x00}, 1, 0},
    {0x24, (uint8_t[]){0x00}, 1, 0},
    {0x25, (uint8_t[]){0x00}, 1, 0},
    {0x26, (uint8_t[]){0x00}, 1, 0},
    {0x27, (uint8_t[]){0x00}, 1, 0},
    {0x28, (uint8_t[]){0x33}, 1, 0},
    {0x29, (uint8_t[]){0x03}, 1, 0},
    {0x2a, (uint8_t[]){0x00}, 1, 0},
    {0x2b, (uint8_t[]){0x00}, 1, 0},
    {0x2c, (uint8_t[]){0x00}, 1, 0},
    {0x2d, (uint8_t[]){0x00}, 1, 0},
    {0x2e, (uint8_t[]){0x00}, 1, 0},
    {0x2f, (uint8_t[]){0x00}, 1, 0},
    {0x30, (uint8_t[]){0x00}, 1, 0},
    {0x31, (uint8_t[]){0x00}, 1, 0},
    {0x32, (uint8_t[]){0x00}, 1, 0},
    {0x33, (uint8_t[]){0x00}, 1, 0},
    {0x34, (uint8_t[]){0x00}, 1, 0},
    {0x35, (uint8_t[]){0x00}, 1, 0},
    {0x36, (uint8_t[]){0x00}, 1, 0},
    {0x37, (uint8_t[]){0x00}, 1, 0},
    {0x38, (uint8_t[]){0x00}, 1, 0},
    {0x39, (uint8_t[]){0x00}, 1, 0},
    {0x3a, (uint8_t[]){0x00}, 1, 0},
    {0x3b, (uint8_t[]){0x00}, 1, 0},
    {0x3c, (uint8_t[]){0x00}, 1, 0},
    {0x3d, (uint8_t[]){0x00}, 1, 0},
    {0x3e, (uint8_t[]){0x00}, 1, 0},
    {0x3f, (uint8_t[]){0x00}, 1, 0},
    {0x40, (uint8_t[]){0x00}, 1, 0},
    {0x41, (uint8_t[]){0x00}, 1, 0},
    {0x42, (uint8_t[]){0x00}, 1, 0},
    {0x43, (uint8_t[]){0x00}, 1, 0},
    {0x44, (uint8_t[]){0x00}, 1, 0},
    {0x50, (uint8_t[]){0x01}, 1, 0},
    {0x51, (uint8_t[]){0x23}, 1, 0},
    {0x52, (uint8_t[]){0x45}, 1, 0},
    {0x53, (uint8_t[]){0x67}, 1, 0},
    {0x54, (uint8_t[]){0x89}, 1, 0},
    {0x55, (uint8_t[]){0xab}, 1, 0},
    {0x56, (uint8_t[]){0x01}, 1, 0},
    {0x57, (uint8_t[]){0x23}, 1, 0},
    {0x58, (uint8_t[]){0x45}, 1, 0},
    {0x59, (uint8_t[]){0x67}, 1, 0},
    {0x5a, (uint8_t[]){0x89}, 1, 0},
    {0x5b, (uint8_t[]){0xab}, 1, 0},
    {0x5c, (uint8_t[]){0xcd}, 1, 0},
    {0x5d, (uint8_t[]){0xef}, 1, 0},
    {0x5e, (uint8_t[]){0x11}, 1, 0},
    {0x5f, (uint8_t[]){0x02}, 1, 0},
    {0x60, (uint8_t[]){0x00}, 1, 0},
    {0x61, (uint8_t[]){0x07}, 1, 0},
    {0x62, (uint8_t[]){0x06}, 1, 0},
    {0x63, (uint8_t[]){0x0E}, 1, 0},
    {0x64, (uint8_t[]){0x0F}, 1, 0},
    {0x65, (uint8_t[]){0x0C}, 1, 0},
    {0x66, (uint8_t[]){0x0D}, 1, 0},
    {0x67, (uint8_t[]){0x02}, 1, 0},
    {0x68, (uint8_t[]){0x02}, 1, 0},
    {0x69, (uint8_t[]){0x02}, 1, 0},
    {0x6a, (uint8_t[]){0x02}, 1, 0},
    {0x6b, (uint8_t[]){0x02}, 1, 0},
    {0x6c, (uint8_t[]){0x02}, 1, 0},
    {0x6d, (uint8_t[]){0x02}, 1, 0},
    {0x6e, (uint8_t[]){0x02}, 1, 0},
    {0x6f, (uint8_t[]){0x02}, 1, 0},
    {0x70, (uint8_t[]){0x02}, 1, 0},
    {0x71, (uint8_t[]){0x02}, 1, 0},
    {0x72, (uint8_t[]){0x02}, 1, 0},
    {0x73, (uint8_t[]){0x05}, 1, 0},
    {0x74, (uint8_t[]){0x01}, 1, 0},
    {0x75, (uint8_t[]){0x02}, 1, 0},
    {0x76, (uint8_t[]){0x00}, 1, 0},
    {0x77, (uint8_t[]){0x07}, 1, 0},
    {0x78, (uint8_t[]){0x06}, 1, 0},
    {0x79, (uint8_t[]){0x0E}, 1, 0},
    {0x7a, (uint8_t[]){0x0F}, 1, 0},
    {0x7b, (uint8_t[]){0x0C}, 1, 0},
    {0x7c, (uint8_t[]){0x0D}, 1, 0},
    {0x7d, (uint8_t[]){0x02}, 1, 0},
    {0x7e, (uint8_t[]){0x02}, 1, 0},
    {0x7f, (uint8_t[]){0x02}, 1, 0},
    {0x80, (uint8_t[]){0x02}, 1, 0},
    {0x81, (uint8_t[]){0x02}, 1, 0},
    {0x82, (uint8_t[]){0x02}, 1, 0},
    {0x83, (uint8_t[]){0x02}, 1, 0},
    {0x84, (uint8_t[]){0x02}, 1, 0},
    {0x85, (uint8_t[]){0x02}, 1, 0},
    {0x86, (uint8_t[]){0x02}, 1, 0},
    {0x87, (uint8_t[]){0x02}, 1, 0},
    {0x88, (uint8_t[]){0x02}, 1, 0},
    {0x89, (uint8_t[]){0x05}, 1, 0},
    {0x8A, (uint8_t[]){0x01}, 1, 0},
    // CMD_Page 4
    {0xFF, (uint8_t[]){0x98, 0x81, 0x04}, 3, 0},
    {0x38, (uint8_t[]){0x01}, 1, 0},
    {0x39, (uint8_t[]){0x00}, 1, 0},
    {0x6C, (uint8_t[]){0x15}, 1, 0},
    {0x6E, (uint8_t[]){0x1A}, 1, 0},
    {0x6F, (uint8_t[]){0x25}, 1, 0},
    {0x3A, (uint8_t[]){0xA4}, 1, 0},
    {0x8D, (uint8_t[]){0x20}, 1, 0},
    {0x87, (uint8_t[]){0xBA}, 1, 0},
    {0x3B, (uint8_t[]){0x98}, 1, 0},
    // CMD_Page 1
    {0xFF, (uint8_t[]){0x98, 0x81, 0x01}, 3, 0},
    {0x22, (uint8_t[]){0x0A}, 1, 0},
    {0x31, (uint8_t[]){0x00}, 1, 0},
    {0x50, (uint8_t[]){0x6B}, 1, 0},
    {0x51, (uint8_t[]){0x66}, 1, 0},
    {0x53, (uint8_t[]){0x73}, 1, 0},
    {0x55, (uint8_t[]){0x8B}, 1, 0},
    {0x60, (uint8_t[]){0x1B}, 1, 0},
    {0x61, (uint8_t[]){0x01}, 1, 0},
    {0x62, (uint8_t[]){0x0C}, 1, 0},
    {0x63, (uint8_t[]){0x00}, 1, 0},
    // Gamma P
    {0xA0, (uint8_t[]){0x00}, 1, 0},
    {0xA1, (uint8_t[]){0x15}, 1, 0},
    {0xA2, (uint8_t[]){0x1F}, 1, 0},
    {0xA3, (uint8_t[]){0x13}, 1, 0},
    {0xA4, (uint8_t[]){0x11}, 1, 0},
    {0xA5, (uint8_t[]){0x21}, 1, 0},
    {0xA6, (uint8_t[]){0x17}, 1, 0},
    {0xA7, (uint8_t[]){0x1B}, 1, 0},
    {0xA8, (uint8_t[]){0x6B}, 1, 0},
    {0xA9, (uint8_t[]){0x1E}, 1, 0},
    {0xAA, (uint8_t[]){0x2B}, 1, 0},
    {0xAB, (uint8_t[]){0x5D}, 1, 0},
    {0xAC, (uint8_t[]){0x19}, 1, 0},
    {0xAD, (uint8_t[]){0x14}, 1, 0},
    {0xAE, (uint8_t[]){0x4B}, 1, 0},
    {0xAF, (uint8_t[]){0x1D}, 1, 0},
    {0xB0, (uint8_t[]){0x27}, 1, 0},
    {0xB1, (uint8_t[]){0x49}, 1, 0},
    {0xB2, (uint8_t[]){0x5D}, 1, 0},
    {0xB3, (uint8_t[]){0x39}, 1, 0},
    // Gamma N
    {0xC0, (uint8_t[]){0x00}, 1, 0},
    {0xC1, (uint8_t[]){0x01}, 1, 0},
    {0xC2, (uint8_t[]){0x0C}, 1, 0},
    {0xC3, (uint8_t[]){0x11}, 1, 0},
    {0xC4, (uint8_t[]){0x15}, 1, 0},
    {0xC5, (uint8_t[]){0x28}, 1, 0},
    {0xC6, (uint8_t[]){0x1B}, 1, 0},
    {0xC7, (uint8_t[]){0x1C}, 1, 0},
    {0xC8, (uint8_t[]){0x62}, 1, 0},
    {0xC9, (uint8_t[]){0x1C}, 1, 0},
    {0xCA, (uint8_t[]){0x29}, 1, 0},
    {0xCB, (uint8_t[]){0x60}, 1, 0},
    {0xCC, (uint8_t[]){0x16}, 1, 0},
    {0xCD, (uint8_t[]){0x17}, 1, 0},
    {0xCE, (uint8_t[]){0x4A}, 1, 0},
    {0xCF, (uint8_t[]){0x23}, 1, 0},
    {0xD0, (uint8_t[]){0x24}, 1, 0},
    {0xD1, (uint8_t[]){0x4F}, 1, 0},
    {0xD2, (uint8_t[]){0x5F}, 1, 0},
    {0xD3, (uint8_t[]){0x39}, 1, 0},
    // CMD_Page 0
    {0xFF, (uint8_t[]){0x98, 0x81, 0x00}, 3, 0},
    {0x35, (uint8_t[]){0x00}, 0, 0},
    {0xFE, (uint8_t[]){0x00}, 0, 0},
    {0x29, (uint8_t[]){0x00}, 0, 0},
};

// ---------------------------------------------------------------------------
// Backlight
// ---------------------------------------------------------------------------
static esp_err_t backlight_init(void)
{
    const ledc_timer_config_t timer_cfg = {
        .speed_mode      = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_12_BIT,
        .timer_num       = LEDC_TIMER_1,
        .freq_hz         = TAB5_LCD_BACKLIGHT_FREQ,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer_cfg), TAG, "Backlight timer config failed");

    const ledc_channel_config_t ch_cfg = {
        .gpio_num   = TAB5_LCD_BACKLIGHT_GPIO,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LCD_LEDC_CH,
        .intr_type  = LEDC_INTR_DISABLE,
        .timer_sel  = LEDC_TIMER_1,
        .duty       = 0,
        .hpoint     = 0,
    };
    ESP_RETURN_ON_ERROR(ledc_channel_config(&ch_cfg), TAG, "Backlight channel config failed");

    return ESP_OK;
}

esp_err_t tab5_display_set_brightness(int percent)
{
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;
    uint32_t duty = (4095 * percent) / 100;
    ESP_RETURN_ON_ERROR(ledc_set_duty(LEDC_LOW_SPEED_MODE, LCD_LEDC_CH, duty), TAG, "Set duty failed");
    ESP_RETURN_ON_ERROR(ledc_update_duty(LEDC_LOW_SPEED_MODE, LCD_LEDC_CH), TAG, "Update duty failed");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// MIPI DSI PHY power
// ---------------------------------------------------------------------------
static esp_err_t enable_dsi_phy_power(void)
{
    static esp_ldo_channel_handle_t phy_pwr = NULL;
    esp_ldo_channel_config_t ldo_cfg = {
        .chan_id     = TAB5_DSI_PHY_LDO_CHAN,
        .voltage_mv = TAB5_DSI_PHY_LDO_VOLTAGE_MV,
    };
    ESP_RETURN_ON_ERROR(esp_ldo_acquire_channel(&ldo_cfg, &phy_pwr), TAG, "LDO acquire failed");
    ESP_LOGI(TAG, "MIPI DSI PHY powered on (LDO ch%d, %dmV)", TAB5_DSI_PHY_LDO_CHAN, TAB5_DSI_PHY_LDO_VOLTAGE_MV);
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// Display init
// ---------------------------------------------------------------------------
esp_err_t tab5_display_init(void)
{
    ESP_LOGI(TAG, "Initializing %dx%d MIPI DSI display (ILI9881C)", TAB5_DISPLAY_WIDTH, TAB5_DISPLAY_HEIGHT);

    // Step 1: Backlight PWM
    ESP_RETURN_ON_ERROR(backlight_init(), TAG, "Backlight init failed");

    // Step 2: MIPI DSI PHY power
    ESP_RETURN_ON_ERROR(enable_dsi_phy_power(), TAG, "DSI PHY power failed");

    // Step 3: Create MIPI DSI bus
    esp_lcd_dsi_bus_config_t bus_cfg = {
        .bus_id             = 0,
        .num_data_lanes     = TAB5_DSI_LANE_NUM,
        .phy_clk_src        = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
        .lane_bit_rate_mbps = TAB5_DSI_LANE_BITRATE_MBPS,
    };
    ESP_RETURN_ON_ERROR(esp_lcd_new_dsi_bus(&bus_cfg, &s_dsi_bus), TAG, "DSI bus create failed");
    ESP_LOGI(TAG, "DSI bus created: %d lanes @ %d Mbps", TAB5_DSI_LANE_NUM, TAB5_DSI_LANE_BITRATE_MBPS);

    // Step 4: DBI panel IO for commands
    esp_lcd_dbi_io_config_t dbi_cfg = {
        .virtual_channel = 0,
        .lcd_cmd_bits    = 8,
        .lcd_param_bits  = 8,
    };
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_dbi(s_dsi_bus, &dbi_cfg, &s_panel_io), TAG, "DBI IO create failed");

    // Step 5: DPI panel config (video mode)
    esp_lcd_dpi_panel_config_t dpi_cfg = {
        .virtual_channel    = 0,
        .dpi_clk_src        = MIPI_DSI_DPI_CLK_SRC_DEFAULT,
        .dpi_clock_freq_mhz = TAB5_DSI_DPI_CLK_MHZ,
        .pixel_format       = LCD_COLOR_PIXEL_FORMAT_RGB565,
        .num_fbs            = 1,
        .video_timing = {
            .h_size            = TAB5_DISPLAY_WIDTH,
            .v_size            = TAB5_DISPLAY_HEIGHT,
            .hsync_back_porch  = TAB5_DSI_HBP,
            .hsync_pulse_width = TAB5_DSI_HSYNC_WIDTH,
            .hsync_front_porch = TAB5_DSI_HFP,
            .vsync_back_porch  = TAB5_DSI_VBP,
            .vsync_pulse_width = TAB5_DSI_VSYNC_WIDTH,
            .vsync_front_porch = TAB5_DSI_VFP,
        },
        .flags.use_dma2d = true,
    };

    // Step 6: ILI9881C panel with vendor init commands
    ili9881c_vendor_config_t vendor_cfg = {
        .init_cmds      = s_ili9881c_init_cmds,
        .init_cmds_size = sizeof(s_ili9881c_init_cmds) / sizeof(s_ili9881c_init_cmds[0]),
        .mipi_config = {
            .dsi_bus    = s_dsi_bus,
            .dpi_config = &dpi_cfg,
            .lane_num   = TAB5_DSI_LANE_NUM,
        },
    };

    esp_lcd_panel_dev_config_t panel_cfg = {
        .bits_per_pixel = TAB5_LCD_BPP,
        .rgb_ele_order  = LCD_RGB_ELEMENT_ORDER_RGB,
        .reset_gpio_num = -1,  // Reset via IO expander
        .vendor_config  = &vendor_cfg,
    };

    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_ili9881c(s_panel_io, &panel_cfg, &s_panel), TAG, "ILI9881C panel create failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(s_panel), TAG, "Panel reset failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_init(s_panel), TAG, "Panel init failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_disp_on_off(s_panel, true), TAG, "Display on failed");

    // Turn on backlight
    ESP_RETURN_ON_ERROR(tab5_display_set_brightness(80), TAG, "Backlight on failed");

    s_initialized = true;
    ESP_LOGI(TAG, "Display initialized: %dx%d MIPI DSI ILI9881C", TAB5_DISPLAY_WIDTH, TAB5_DISPLAY_HEIGHT);
    return ESP_OK;
}

void tab5_display_fill_color(uint16_t color_rgb565)
{
    if (!s_initialized || !s_panel) return;

    // Allocate full framebuffer in PSRAM and draw in one shot
    size_t fb_size = TAB5_DISPLAY_WIDTH * TAB5_DISPLAY_HEIGHT * sizeof(uint16_t);
    uint16_t *fb = heap_caps_malloc(fb_size, MALLOC_CAP_SPIRAM);
    if (!fb) {
        ESP_LOGE(TAG, "Failed to allocate fill buffer (%d bytes)", fb_size);
        return;
    }

    for (int i = 0; i < TAB5_DISPLAY_WIDTH * TAB5_DISPLAY_HEIGHT; i++) {
        fb[i] = color_rgb565;
    }

    esp_lcd_panel_draw_bitmap(s_panel, 0, 0, TAB5_DISPLAY_WIDTH, TAB5_DISPLAY_HEIGHT, fb);
    free(fb);
    ESP_LOGI(TAG, "Filled display with color 0x%04X", color_rgb565);
}

void tab5_display_show_status(const char *msg)
{
    ESP_LOGI(TAG, "Status: %s", msg);
}
