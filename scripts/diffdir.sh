#!/bin/bash

# Скрипт для сравнения двух директорий по именам файлов
# Выводит файлы, которые есть только в одной из директорий

if [ "$#" -ne 2 ]; then
    echo "Использование: $0 <path_a/> <path_b/>"
    echo "Пример: $0 folder1/ folder2/"
    exit 1
fi

DIR_A="$1"
DIR_B="$2"

# Проверяем, что оба аргумента - директории
if [ ! -d "$DIR_A" ]; then
    echo "Ошибка: '$DIR_A' не является директорией"
    exit 1
fi

if [ ! -d "$DIR_B" ]; then
    echo "Ошибка: '$DIR_B' не является директорией"
    exit 1
fi

# Получаем относительные пути директорий
DIR_A="$(cd "$DIR_A" && pwd)"
DIR_B="$(cd "$DIR_B" && pwd)"

# Получаем списки файлов (только файлы, не директории) с относительными путями
# Сравниваем по базовому имени файла (без расширения)
files_a=$(find "$DIR_A" -type f | sed "s|^${DIR_A}/||" | while read -r f; do echo "$(basename "$f" | sed 's/\.[^.]*$//')|$f"; done | sort)
files_b=$(find "$DIR_B" -type f | sed "s|^${DIR_B}/||" | while read -r f; do echo "$(basename "$f" | sed 's/\.[^.]*$//')|$f"; done | sort)

echo "========================================="
echo "Сравнение директорий:"
echo "  A: $DIR_A"
echo "  B: $DIR_B"
echo "========================================="

# 1) Файлы, которые есть только в path_a (по базовому имени без расширения)
echo ""
echo "1) Файлы, которые есть ТОЛЬКО в $DIR_A:"
echo "-----------------------------------------"
only_in_a=$(comm -23 <(echo "$files_a" | cut -d'|' -f1) <(echo "$files_b" | cut -d'|' -f1))
if [ -z "$only_in_a" ]; then
    echo "  (нет таких файлов)"
else
    echo "$only_in_a" | while read -r basename; do
        # Находим полный путь файла в DIR_A
        filepath=$(echo "$files_a" | grep "^${basename}|" | head -1 | cut -d'|' -f2)
        echo "  $filepath"
    done
fi

# 2) Файлы, которые есть только в path_b (по базовому имени без расширения)
echo ""
echo "2) Файлы, которые есть ТОЛЬКО в $DIR_B:"
echo "-----------------------------------------"
only_in_b=$(comm -13 <(echo "$files_a" | cut -d'|' -f1) <(echo "$files_b" | cut -d'|' -f1))
if [ -z "$only_in_b" ]; then
    echo "  (нет таких файлов)"
else
    echo "$only_in_b" | while read -r basename; do
        # Находим полный путь файла в DIR_B
        filepath=$(echo "$files_b" | grep "^${basename}|" | head -1 | cut -d'|' -f2)
        echo "  $filepath"
    done
fi

echo ""
echo "========================================="