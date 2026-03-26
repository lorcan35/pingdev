#pragma once
#include "esp_err.h"
#include <stdint.h>

esp_err_t tab5_touch_init(void);
void tab5_touch_start_sender(void);
unsigned long tab5_touch_get_event_count(void);
