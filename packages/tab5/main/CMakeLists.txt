idf_component_register(
    SRCS "main.c" "display.c"
    INCLUDE_DIRS "."
    REQUIRES esp_lcd esp_psram driver nvs_flash esp_system heap
)
