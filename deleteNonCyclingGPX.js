const fs = require('fs').promises;
const path = require('path');
const { DOMParser } = require('xmldom');

// Путь к папке с GPX файлами
const directoryPath = './gpx-files';

// Функция для проверки, содержит ли файл тип "cycling"
async function checkIfCycling(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(data, 'application/xml');
    const typeNode = doc.getElementsByTagName('type')[0];
    const type = typeNode ? typeNode.textContent : null;
    return type === 'cycling';
  } catch (err) {
    console.error(`Ошибка при чтении файла ${filePath}:`, err);
    return false;
  }
}

// Функция для удаления файла
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`Файл ${filePath} удалён.`);
  } catch (err) {
    console.error(`Ошибка при удалении файла ${filePath}:`, err);
  }
}

// Основная функция для обработки файлов
async function processFiles() {
  try {
    const files = await fs.readdir(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);

      // Проверяем, является ли файл GPX файлом
      if (path.extname(file).toLowerCase() === '.gpx') {
        const isCycling = await checkIfCycling(filePath);
        if (!isCycling) {
          await deleteFile(filePath);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка при чтении директории:', err);
  }
}

// Запуск обработки файлов
processFiles();