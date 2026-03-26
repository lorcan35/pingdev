idf_component_register(
    SRCS "main.c" "display.c" "io_expander.c" "esp_lcd_st7123.c"
    INCLUDE_DIRS "."
    REQUIRES esp_lcd esp_psram driver nvs_flash esp_system heap esp_mm
)
