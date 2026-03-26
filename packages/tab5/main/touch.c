/**
 * TinkerClaw Tab5 — Touch input + WebSocket sender
 *
 * Reads capacitive touch events from the GT911/CST816 controller,
 * translates to screen coordinates, and sends to Dragon via WebSocket.
 *
 * Touch events are sent as JSON:
 *   {"type":"tap","x":400,"y":240}
 *   {"type":"swipe","x1":100,"y1":240,"x2":700,"y2":240,"dx":600,"dy":0}
 *   {"type":"longpress","x":400,"y":240}
 *
 * Dragon translates these to CDP Input.dispatchMouseEvent calls.
 */

#include "touch.h"
#include "config.h"

#include <string.h>
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/i2c_master.h"
#include "esp_websocket_client.h"

static const char *TAG = "tab5_touch";

static unsigned long s_event_count = 0;
static QueueHandle_t s_touch_queue = NULL;

// Touch event structure
typedef struct {
    enum { TOUCH_TAP, TOUCH_SWIPE, TOUCH_LONGPRESS } type;
    int x, y;          // Current/end position
    int x_start, y_start; // Start position (for swipe)
} touch_event_t;

// GT911 I2C address (common on these boards)
#define GT911_ADDR_1  0x5D
#define GT911_ADDR_2  0x14

// Touch state tracking
static int s_last_x = -1, s_last_y = -1;
static int64_t s_touch_start_time = 0;
static bool s_touching = false;
static int s_touch_start_x = 0, s_touch_start_y = 0;

#define LONGPRESS_THRESHOLD_MS  500
#define SWIPE_THRESHOLD_PX      30

/**
 * Touch polling task — reads I2C touch controller.
 *
 * Note: The actual I2C init and touch controller setup depends on the
 * specific board. This is a placeholder that will be adapted once we
 * identify the exact touch controller on our Tab5 board.
 */
static void touch_read_task(void *arg)
{
    ESP_LOGI(TAG, "Touch read task started");

    // TODO Phase 1: Identify the touch controller via I2C scan
    // For now, we'll scan for known addresses
    ESP_LOGI(TAG, "Scanning for touch controller...");

    // Placeholder: touch events will be fed once we identify the controller
    // The factory firmware clearly has touch working (we saw the diagnostic UI)
    // so the hardware is there — we just need the right driver.

    while (1) {
        // Read touch data from controller
        // Phase 1: poll-based at ~60Hz
        vTaskDelay(pdMS_TO_TICKS(16));

        // TODO: Read actual touch data from I2C
        // When a touch is detected:
        // 1. On touch down: record start position and time
        // 2. On touch up: classify as tap, swipe, or longpress
        // 3. Push to queue for the sender task
    }
}

/**
 * WebSocket sender task — forwards touch events to Dragon.
 */
static void touch_sender_task(void *arg)
{
    ESP_LOGI(TAG, "Touch sender task started");

    char ws_url[128];
    snprintf(ws_url, sizeof(ws_url), "ws://%s:%d%s",
             TAB5_DRAGON_HOST, TAB5_DRAGON_PORT, TAB5_TOUCH_WS_PATH);

    esp_websocket_client_config_t ws_config = {
        .uri = ws_url,
        .reconnect_timeout_ms = 2000,
        .network_timeout_ms = 5000,
    };

    esp_websocket_client_handle_t ws_client = esp_websocket_client_init(&ws_config);
    if (!ws_client) {
        ESP_LOGE(TAG, "WebSocket client init failed");
        vTaskDelete(NULL);
        return;
    }

    esp_err_t ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "WebSocket start failed: %s", esp_err_to_name(ret));
        esp_websocket_client_destroy(ws_client);
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "WebSocket connected to %s", ws_url);

    touch_event_t event;
    char json_buf[256];

    while (1) {
        if (xQueueReceive(s_touch_queue, &event, pdMS_TO_TICKS(100)) == pdTRUE) {
            int len = 0;
            switch (event.type) {
                case TOUCH_TAP:
                    len = snprintf(json_buf, sizeof(json_buf),
                        "{\"type\":\"tap\",\"x\":%d,\"y\":%d}", event.x, event.y);
                    break;
                case TOUCH_SWIPE:
                    len = snprintf(json_buf, sizeof(json_buf),
                        "{\"type\":\"swipe\",\"x1\":%d,\"y1\":%d,\"x2\":%d,\"y2\":%d,\"dx\":%d,\"dy\":%d}",
                        event.x_start, event.y_start, event.x, event.y,
                        event.x - event.x_start, event.y - event.y_start);
                    break;
                case TOUCH_LONGPRESS:
                    len = snprintf(json_buf, sizeof(json_buf),
                        "{\"type\":\"longpress\",\"x\":%d,\"y\":%d}", event.x, event.y);
                    break;
            }

            if (len > 0 && esp_websocket_client_is_connected(ws_client)) {
                esp_websocket_client_send_text(ws_client, json_buf, len, pdMS_TO_TICKS(1000));
                s_event_count++;
            }
        }
    }
}

esp_err_t tab5_touch_init(void)
{
    s_touch_queue = xQueueCreate(32, sizeof(touch_event_t));
    if (!s_touch_queue) {
        return ESP_ERR_NO_MEM;
    }

    // Start touch read task on core 0
    xTaskCreatePinnedToCore(
        touch_read_task,
        "touch_read",
        4096,
        NULL,
        4,      // Medium-high priority
        NULL,
        0       // Core 0
    );

    ESP_LOGI(TAG, "Touch initialized");
    return ESP_OK;
}

void tab5_touch_start_sender(void)
{
    xTaskCreatePinnedToCore(
        touch_sender_task,
        "touch_send",
        4096,
        NULL,
        3,      // Medium priority
        NULL,
        0       // Core 0
    );
}

unsigned long tab5_touch_get_event_count(void)
{
    return s_event_count;
}
