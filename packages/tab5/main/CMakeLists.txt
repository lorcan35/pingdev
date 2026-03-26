idf_component_register(
    SRCS "main.c" "display.c" "io_expander.c"
    INCLUDE_DIRS "."
    REQUIRES esp_lcd esp_psram driver nvs_flash esp_system heap esp_lcd_ili9881c
)
