#pragma once
#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>

esp_err_t tab5_display_init(void);
void tab5_display_fill_color(uint16_t color_rgb565);
esp_err_t tab5_display_draw_jpeg(const uint8_t *jpeg_data, size_t jpeg_len);
void tab5_display_show_status(const char *msg);
