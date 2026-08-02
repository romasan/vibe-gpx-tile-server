#!/bin/bash

# Определяем корень проекта (родительская папка scripts/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Проверяем, передан ли аргумент
if [ -z "$1" ]; then
    echo "Ошибка: Не указан путь к папке."
    echo "Использование: $0 /путь/к/папке"
    echo "Пример: $0 gpx-files"
    exit 1
fi

TARGET_DIR="$1"

# Проверяем, существует ли папка
if [ ! -d "$TARGET_DIR" ]; then
    echo "Ошибка: Папка '$TARGET_DIR' не существует или не является директорией."
    exit 1
fi

# Приводим путь к абсолютному виду
TARGET_DIR=$(realpath "$TARGET_DIR")

echo "=== Подготовка треков в папке: $TARGET_DIR ==="
echo

# Шаг 1: Распаковка .gz файлов
echo "--- Шаг 1/3: Распаковка .gz файлов ---"
bash "$PROJECT_ROOT/scripts/unpack_gz.sh" "$TARGET_DIR"
echo

# Шаг 2: Конвертация .fit в .gpx
echo "--- Шаг 2/3: Конвертация .fit в .gpx ---"
node "$PROJECT_ROOT/scripts/convertFitToGpx.js" "$TARGET_DIR"
echo

# Шаг 3: Удаление не-велосипедных треков
echo "--- Шаг 3/3: Удаление не-велосипедных треков ---"
node "$PROJECT_ROOT/scripts/deleteNonCyclingGPX.js" "$TARGET_DIR"
echo

echo "=== Готово ==="