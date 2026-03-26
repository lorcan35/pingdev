/**
 * TinkerClaw Tab5 — Phase 1.5: MIPI DSI Display
 *
 * Prove we can:
 * 1. Boot on ESP32-P4
 * 2. Initialize I2C and IO expanders (PI4IOE5V6416)
 * 3. Initialize MIPI DSI display (720x1280 ILI9881C)
 * 4. Show colors on screen
 * 5. Communicate over USB serial
 *
 * WiFi (ESP-Hosted via ESP32-C6) comes in Phase 2.
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_chip_info.h"
#include "nvs_flash.h"
#include "esp_heap_caps.h"
#include "driver/i2c_master.h"

#include "config.h"
#include "io_expander.h"
#include "display.h"

static const char *TAG = "tab5";

static i2c_master_bus_handle_t s_i2c_bus = NULL;

static esp_err_t init_i2c(void)
{
    i2c_master_bus_config_t bus_cfg = {
        .i2c_port   = TAB5_I2C_NUM,
        .sda_io_num = TAB5_I2C_SDA,
        .scl_io_num = TAB5_I2C_SCL,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    return i2c_new_master_bus(&bus_cfg, &s_i2c_bus);
}

void app_main(void)
{
    printf("\n\n");
    printf("========================================\n");
    printf("  TinkerClaw Tab5 v0.2.0\n");
    printf("  ESP32-P4 | M5Stack Tab5\n");
    printf("  720x1280 MIPI DSI ILI9881C\n");
    printf("========================================\n\n");

    // Print chip info
    esp_chip_info_t chip_info;
    esp_chip_info(&chip_info);
    ESP_LOGI(TAG, "ESP32-P4 rev %d.%d, %d cores", chip_info.revision / 100, chip_info.revision % 100, chip_info.cores);
    ESP_LOGI(TAG, "Free heap: %lu bytes", (unsigned long)esp_get_free_heap_size());
    ESP_LOGI(TAG, "Free PSRAM: %lu bytes", (unsigned long)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));

    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize I2C bus
    ESP_LOGI(TAG, "Initializing I2C (SDA=%d, SCL=%d)...", TAB5_I2C_SDA, TAB5_I2C_SCL);
    ret = init_i2c();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2C init failed: %s", esp_err_to_name(ret));
        ESP_LOGW(TAG, "Continuing without I2C peripherals");
    } else {
        ESP_LOGI(TAG, "I2C initialized");

        // Scan I2C bus to detect devices
        ESP_LOGI(TAG, "Scanning I2C bus...");
        for (uint8_t addr = 0x08; addr < 0x78; addr++) {
            if (i2c_master_probe(s_i2c_bus, addr, 50) == ESP_OK) {
                ESP_LOGI(TAG, "  I2C device found at 0x%02X", addr);
            }
        }

        // Initialize IO expanders
        ret = tab5_io_expander_init(s_i2c_bus);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "IO expander init failed: %s", esp_err_to_name(ret));
        } else {
            // Reset LCD and touch via IO expander
            tab5_reset_display_and_touch();
            // BSP has ~500ms of other init between reset and display — stabilize
            vTaskDelay(pdMS_TO_TICKS(300));
        }

        // Detect display type (BSP method: probe touch controller)
        // GT911 at 0x14 or 0x5D → ILI9881C/ST7703 panel
        // Touch at 0x55 → ST7123 panel
        if (i2c_master_probe(s_i2c_bus, 0x55, 50) == ESP_OK) {
            ESP_LOGW(TAG, "*** DETECTED: ST7123 touch at 0x55 — need ST7123 display driver! ***");
        }
        if (i2c_master_probe(s_i2c_bus, 0x5D, 50) == ESP_OK) {
            ESP_LOGI(TAG, "DETECTED: GT911 touch at 0x5D — ILI9881C display driver OK");
        }
        if (i2c_master_probe(s_i2c_bus, 0x14, 50) == ESP_OK) {
            ESP_LOGI(TAG, "DETECTED: GT911 touch at 0x14 — ILI9881C display driver OK");
        }
    }

    // Initialize MIPI DSI display
    ESP_LOGI(TAG, "Initializing display...");
    ret = tab5_display_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Display init failed: %s", esp_err_to_name(ret));
        ESP_LOGW(TAG, "Continuing without display (serial-only mode)");
    } else {
        ESP_LOGI(TAG, "Display initialized! Running color test...");
        tab5_display_fill_color(0x001F);  // Blue
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0x07E0);  // Green
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0xF800);  // Red
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0x0000);  // Black
    }

    ESP_LOGI(TAG, "Tab5 Phase 1.5 ready. Waiting for commands on USB serial...");
    printf("\nTab5 ready. Commands: info, heap, red, green, blue, black, bright <0-100>\n\n");

    // Simple serial command loop
    char cmd_buf[128];
    while (1) {
        int c = getchar();
        if (c != EOF) {
            static int pos = 0;
            if (c == '\n' || c == '\r') {
                cmd_buf[pos] = '\0';
                if (pos > 0) {
                    if (strcmp(cmd_buf, "info") == 0) {
                        printf("Chip: ESP32-P4 rev %d.%d\n", chip_info.revision / 100, chip_info.revision % 100);
                        printf("Cores: %d\n", chip_info.cores);
                        printf("Free heap: %lu\n", (unsigned long)esp_get_free_heap_size());
                        printf("Free PSRAM: %lu\n", (unsigned long)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
                        printf("Display: 720x1280 MIPI DSI ILI9881C\n");
                    } else if (strcmp(cmd_buf, "heap") == 0) {
                        printf("Heap: %lu / PSRAM: %lu\n",
                               (unsigned long)esp_get_free_heap_size(),
                               (unsigned long)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
                    } else if (strcmp(cmd_buf, "red") == 0) {
                        tab5_display_fill_color(0xF800);
                        printf("Display: red\n");
                    } else if (strcmp(cmd_buf, "green") == 0) {
                        tab5_display_fill_color(0x07E0);
                        printf("Display: green\n");
                    } else if (strcmp(cmd_buf, "blue") == 0) {
                        tab5_display_fill_color(0x001F);
                        printf("Display: blue\n");
                    } else if (strcmp(cmd_buf, "white") == 0) {
                        tab5_display_fill_color(0xFFFF);
                        printf("Display: white\n");
                    } else if (strcmp(cmd_buf, "black") == 0) {
                        tab5_display_fill_color(0x0000);
                        printf("Display: black\n");
                    } else if (strcmp(cmd_buf, "scan") == 0) {
                        printf("Scanning I2C bus...\n");
                        for (uint8_t addr = 0x08; addr < 0x78; addr++) {
                            if (i2c_master_probe(s_i2c_bus, addr, 50) == ESP_OK) {
                                printf("  Device at 0x%02X\n", addr);
                            }
                        }
                        printf("Scan complete.\n");
                    } else if (strncmp(cmd_buf, "bright ", 7) == 0) {
                        int val = atoi(cmd_buf + 7);
                        tab5_display_set_brightness(val);
                        printf("Brightness: %d%%\n", val);
                    } else if (strncmp(cmd_buf, "pattern ", 8) == 0) {
                        int val = atoi(cmd_buf + 8);
                        tab5_display_test_pattern(val);
                        printf("Pattern: %d\n", val);
                    } else if (strcmp(cmd_buf, "pattern") == 0) {
                        tab5_display_test_pattern(1);
                        printf("Pattern: vertical bars\n");
                    } else if (strcmp(cmd_buf, "reboot") == 0) {
                        printf("Rebooting...\n");
                        vTaskDelay(pdMS_TO_TICKS(100));
                        esp_restart();
                    } else {
                        printf("Unknown: %s\n", cmd_buf);
                        printf("Commands: info, heap, red, green, blue, white, black, bright <0-100>, pattern [0-3], reboot, scan\n");
                    }
                }
                pos = 0;
            } else if (pos < (int)sizeof(cmd_buf) - 1) {
                cmd_buf[pos++] = (char)c;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
