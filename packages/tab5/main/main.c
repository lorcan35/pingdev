/**
 * TinkerClaw Tab5 — Phase 1: Hello World
 *
 * Prove we can:
 * 1. Boot on ESP32-P4
 * 2. Initialize the LCD display
 * 3. Show something on screen
 * 4. Communicate over USB serial
 *
 * WiFi and streaming come in Phase 2 once we identify the WiFi co-processor.
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

#include "display.h"

static const char *TAG = "tab5";

void app_main(void)
{
    printf("\n\n");
    printf("========================================\n");
    printf("  TinkerClaw Tab5 v0.1.0\n");
    printf("  ESP32-P4 Live Browser Remote\n");
    printf("========================================\n\n");

    // Print chip info
    esp_chip_info_t chip_info;
    esp_chip_info(&chip_info);
    ESP_LOGI(TAG, "ESP32-P4 rev %d.%d", chip_info.revision / 100, chip_info.revision % 100);
    ESP_LOGI(TAG, "Cores: %d", chip_info.cores);
    ESP_LOGI(TAG, "Free heap: %lu bytes", (unsigned long)esp_get_free_heap_size());
    ESP_LOGI(TAG, "Free PSRAM: %lu bytes",
             (unsigned long)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));

    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize display
    ESP_LOGI(TAG, "Initializing display...");
    ret = tab5_display_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Display init failed: %s", esp_err_to_name(ret));
        ESP_LOGW(TAG, "Continuing without display (serial-only mode)");
    } else {
        ESP_LOGI(TAG, "Display initialized!");
        tab5_display_fill_color(0x001F);  // Blue
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0x07E0);  // Green
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0xF800);  // Red
        vTaskDelay(pdMS_TO_TICKS(500));
        tab5_display_fill_color(0x0000);  // Black
    }

    ESP_LOGI(TAG, "Tab5 Phase 1 ready. Waiting for commands on USB serial...");
    printf("\nTab5 ready. Type 'info' for system info, 'heap' for memory.\n\n");

    // Simple serial command loop for testing
    char cmd_buf[128];
    while (1) {
        // Check if there's serial input
        int c = getchar();
        if (c != EOF) {
            // Simple line buffer
            static int pos = 0;
            if (c == '\n' || c == '\r') {
                cmd_buf[pos] = '\0';
                if (pos > 0) {
                    // Process command
                    if (strcmp(cmd_buf, "info") == 0) {
                        printf("Chip: ESP32-P4 rev %d.%d\n", chip_info.revision / 100, chip_info.revision % 100);
                        printf("Cores: %d\n", chip_info.cores);
                        printf("Free heap: %lu\n", (unsigned long)esp_get_free_heap_size());
                        printf("Free PSRAM: %lu\n", (unsigned long)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
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
                    } else if (strcmp(cmd_buf, "black") == 0) {
                        tab5_display_fill_color(0x0000);
                        printf("Display: black\n");
                    } else {
                        printf("Unknown command: %s\n", cmd_buf);
                        printf("Commands: info, heap, red, green, blue, black\n");
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
