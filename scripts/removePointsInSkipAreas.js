const fs = require('fs').promises;
const path = require('path');
const { DOMParser, XMLSerializer } = require('xmldom');

// Получаем путь к папке из аргументов командной строки
const targetDir = process.argv[2];

if (!targetDir) {
  console.error('Использование: node removePointsInSkipAreas.js <путь_к_папке>');
  console.error('Пример: node removePointsInSkipAreas.js gpx-files');
  process.exit(1);
}

// Разрешаем путь относительно рабочей директории
const directoryPath = path.resolve(targetDir);

// GPX namespace
const GPX_NS = 'http://www.topografix.com/GPX/1/1';

function isPointInAnyArea(lat, lon, skipAreas) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum)) {
    return false;
  }

  return skipAreas.some((area) => {
    const minLat = Math.min(parseFloat(area.minLat), parseFloat(area.maxLat));
    const maxLat = Math.max(parseFloat(area.minLat), parseFloat(area.maxLat));
    const minLng = Math.min(parseFloat(area.minLng), parseFloat(area.maxLng));
    const maxLng = Math.max(parseFloat(area.minLng), parseFloat(area.maxLng));

    return latNum >= minLat && latNum <= maxLat && lonNum >= minLng && lonNum <= maxLng;
  });
}

// Получение всех точек трека (с учётом namespace и без него)
function getTrkpts(doc) {
  const byNS = doc.getElementsByTagNameNS(GPX_NS, 'trkpt');
  if (byNS.length > 0) {
    return Array.from(byNS);
  }
  return Array.from(doc.getElementsByTagName('trkpt'));
}

// Обработка одного GPX файла
async function processGpxFile(filePath, skipAreas) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(data, 'application/xml');
    const trkpts = getTrkpts(doc);

    if (trkpts.length === 0) {
      return;
    }

    let removed = 0;

    trkpts.forEach((trkpt) => {
      const lat = trkpt.getAttribute('lat');
      const lon = trkpt.getAttribute('lon');

      if (lat && lon && isPointInAnyArea(lat, lon, skipAreas)) {
        trkpt.parentNode.removeChild(trkpt);
        removed++;
      }
    });

    if (removed === 0) {
      return;
    }

    // Если не осталось ни одной точки — удаляем файл
    if (getTrkpts(doc).length === 0) {
      await fs.unlink(filePath);
      console.log(`Удалён (не осталось точек): ${path.basename(filePath)}`);
      return;
    }

    // Сериализуем XML и сохраняем XML-декларацию, если она была
    let xml = new XMLSerializer().serializeToString(doc);
    const declarationMatch = data.match(/^\s*<\?xml[^?]*\?>/);
    if (declarationMatch && !/^\s*<\?xml/.test(xml)) {
      xml = declarationMatch[0] + '\n' + xml;
    }

    await fs.writeFile(filePath, xml, 'utf8');
    console.log(`${path.basename(filePath)}: удалено точек — ${removed}`);
  } catch (err) {
    console.error(`Ошибка при обработке файла ${filePath}:`, err);
  }
}

// Рекурсивный обход директории и обработка GPX файлов
async function processDirectory(dirPath, skipAreas) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await processDirectory(fullPath, skipAreas);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.gpx') {
        await processGpxFile(fullPath, skipAreas);
      }
    }
  } catch (err) {
    console.error(`Ошибка при чтении директории ${dirPath}:`, err);
  }
}

// Загрузка областей вырезания и запуск обработки
async function main() {
  const skipAreasPath = path.join(__dirname, 'skipAreas.json');
  let skipAreas;

  try {
    skipAreas = JSON.parse(await fs.readFile(skipAreasPath, 'utf8'));
  } catch (err) {
    console.error(`Ошибка при чтении ${skipAreasPath}:`, err);
    process.exit(1);
  }

  console.log(`Обработка директории: ${directoryPath}`);
  console.log(`Загружено областей: ${skipAreas.length}`);

  await processDirectory(directoryPath, skipAreas);
}

main();