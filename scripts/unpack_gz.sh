#!/bin/bash

# Проверяем, передан ли аргумент
if [ -z "$1" ]; then
    echo "Ошибка: Не указан путь к папке."
    echo "Использование: $0 /путь/к/папке"
    exit 1
fi

TARGET_DIR="$1"

# Проверяем, существует ли папка
if [ ! -d "$TARGET_DIR" ]; then
    echo "Ошибка: Папка '$TARGET_DIR' не существует или не является директорией."
    exit 1
fi

# Приводим путь к виду без слэша в конце (для красоты вывода), но работаем с кавычками
TARGET_DIR=$(realpath "$TARGET_DIR")

echo "Начинаю обработку папки: $TARGET_DIR"

count=0

# Цикл по всем файлам .gz в папке
for file in "$TARGET_DIR"/*.gz; do
    # Проверка: если файлов .gz нет, цикл может вернуть сам шаблон "*.gz"
    if [ -f "$file" ]; then
        echo "Распаковка: $file"
        
        # gunzip распаковывает файл и удаляет оригинал .gz
        if gunzip "$file"; then
            ((count++))
        else
            echo "Ошибка при распаковке: $file"
        fi
    fi
done

echo "Готово. Распаковано файлов: $count"
