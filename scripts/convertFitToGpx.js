const fs = require('fs').promises;
const path = require('path');
const { default: FitParser } = require('fit-file-parser');

// Получаем путь к папке из аргументов командной строки
const targetDir = process.argv[2];

if (!targetDir) {
  console.error('Использование: node convertFitToGpx.js <путь_к_папке>');
  console.error('Пример: node convertFitToGpx.js gpx-files');
  process.exit(1);
}

// Разрешаем путь относительно рабочей директории
const directoryPath = path.resolve(targetDir);

console.log(`Обработка директории: ${directoryPath}`);

// Экранирование XML-спецсимволов
function escapeXml(str) {
  const AMP = String.fromCharCode(38);
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const QUOT = String.fromCharCode(34);
  const APOS = String.fromCharCode(39);

  return String(str)
    .replace(new RegExp(AMP, 'g'), AMP + 'amp;')
    .replace(new RegExp(LT, 'g'), AMP + 'lt;')
    .replace(new RegExp(GT, 'g'), AMP + 'gt;')
    .replace(new RegExp(QUOT, 'g'), AMP + 'quot;')
    .replace(new RegExp(APOS, 'g'), AMP + 'apos;');
}

// Генерация GPX-содержимого из записей FIT-файла
function buildGpx(records, trackName) {
  const points = records
    .filter((r) => r.position_lat !== undefined && r.position_long !== undefined)
    .map((r) => {
      const ele = r.enhanced_altitude !== undefined ? r.enhanced_altitude
        : (r.altitude !== undefined ? r.altitude : null);
      const time = r.timestamp || null;

      let trkpt = `      <trkpt lat="${r.position_lat}" lon="${r.position_long}">\n`;
      if (ele !== null) trkpt += `        <ele>${ele}</ele>\n`;
      if (time) trkpt += `        <time>${time}</time>\n`;
      trkpt += `      </trkpt>`;
      return trkpt;
    });

  if (points.length === 0) {
    throw new Error('В FIT-файле не найдено ни одной точки с координатами');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="fit-to-gpx-converter" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${points.join('\n')}
    </trkseg>
  </trk>
</gpx>
`;
}

// Конвертация одного файла .fit в .gpx
async function convertFitFile(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const parser = new FitParser({
      mode: 'list',
      speedUnit: 'km/h',
      lengthUnit: 'm',
    });
    const data = await parser.parseAsync(buffer);

    const records = data.records || [];
    if (records.length === 0) {
      throw new Error('В FIT-файле нет записей (records)');
    }

    const baseName = path.basename(filePath, path.extname(filePath));
    const gpxPath = path.join(path.dirname(filePath), baseName + '.gpx');
    const gpxContent = buildGpx(records, baseName);

    await fs.writeFile(gpxPath, gpxContent, 'utf8');

    // FIT-файл удаляем только после успешной записи GPX
    await fs.unlink(filePath);

    console.log(`Создан: ${path.basename(gpxPath)}`);
  } catch (err) {
    console.error(`Ошибка при конвертации ${filePath}:`, err);
  }
}

// Рекурсивный обход директории и обработка FIT-файлов
async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await processDirectory(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.fit') {
        await convertFitFile(fullPath);
      }
    }
  } catch (err) {
    console.error(`Ошибка при чтении директории ${dirPath}:`, err);
  }
}

// Запуск обработки
processDirectory(directoryPath);