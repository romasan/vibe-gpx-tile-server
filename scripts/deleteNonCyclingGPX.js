const fs = require('fs').promises;
const path = require('path');
const { DOMParser } = require('xmldom');

// Получаем путь к папке из аргументов командной строки
const targetDir = process.argv[2];

if (!targetDir) {
  console.error('Использование: node deleteNonCyclingGPX.js <путь_к_папке>');
  console.error('Пример: node deleteNonCyclingGPX.js gpx-files');
  process.exit(1);
}

// Разрешаем путь относительно рабочей директории
const directoryPath = path.resolve(targetDir);

console.log(`Обработка директории: ${directoryPath}`);

// Функция для проверки, содержит ли файл тип "cycling" (не "walking")
async function checkIfCycling(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(data, 'application/xml');
    const typeNode = doc.getElementsByTagName('type')[0];
    const type = typeNode ? typeNode.textContent : null;
    return type !== 'walking';
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

// Рекурсивный обход директории и обработка GPX файлов
async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Рекурсивно обрабатываем поддиректории
        await processDirectory(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.gpx') {
        const isCycling = await checkIfCycling(fullPath);
        if (!isCycling) {
          await deleteFile(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`Ошибка при чтении директории ${dirPath}:`, err);
  }
}

// Запуск обработки
processDirectory(directoryPath);