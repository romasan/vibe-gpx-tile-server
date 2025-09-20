const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const toGeoJSON = require('@mapbox/togeojson');
const { DOMParser } = require('xmldom');

// Путь к папке с GPX-файлами
const gpxDir = path.join(__dirname, 'gpx-files');

// Путь к папке для хранения кэшированных тайлов
const tileCacheDir = path.join(__dirname, 'tile-cache');

// Создание папки для кэшированных тайлов, если она не существует
if (!fs.existsSync(tileCacheDir)) {
  fs.mkdirSync(tileCacheDir, { recursive: true });
}

// Кэш для данных GeoJSON
let geojsonCache = null;
let tileFeatureMap = {};
let mapCenter = null;
let mapZoom = null;

// Чтение и преобразование GPX в GeoJSON
function loadGPXFiles() {
  const files = fs.readdirSync(gpxDir).filter(file => file.endsWith('.gpx'));
  const geojsonFeatures = files.map(file => {
    const gpxData = fs.readFileSync(path.join(gpxDir, file), 'utf8');
    const gpxDoc = new DOMParser().parseFromString(gpxData);
    const geojson = toGeoJSON.gpx(gpxDoc);
    return geojson.features;
  }).flat();
  return { type: 'FeatureCollection', features: geojsonFeatures };
}

// Функция для вычисления пересечений маршрутов с тайлами
function calculateTileIntersections(geojson) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

  geojson.features.forEach((feature, featureIndex) => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(coord => {
        const [lon, lat] = coord;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);

        for (let z = 0; z <= 19; z++) {
          const tileX = Math.floor(((lon + 180) / 360) * Math.pow(2, z));
          const tileY = Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * Math.pow(2, z));
          const tileKey = `${z}-${tileX}-${tileY}`;
          if (!tileFeatureMap[tileKey]) {
            tileFeatureMap[tileKey] = new Set();
          }
          tileFeatureMap[tileKey].add(featureIndex);
        }
      });
    }
  });

  // Вычисление центра карты
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  mapCenter = [centerLat, centerLon];

  // Вычисление масштаба карты
  const latDiff = maxLat - minLat;
  const lonDiff = maxLon - minLon;
  const maxDiff = Math.max(latDiff, lonDiff);
  mapZoom = Math.floor(8 - Math.log(maxDiff) / Math.log(2));
}

// Инициализация кэша при запуске сервера
function initializeCache() {
  geojsonCache = loadGPXFiles();
  calculateTileIntersections(geojsonCache);
}

// Функция для рендеринга тайлов
async function renderTile(z, x, y) {
  const tileSize = 256;
  const tileKey = `${z}-${x}-${y}`;
  const featuresToRender = tileFeatureMap[tileKey] || new Set();

  // Создание пустого изображения
  const image = sharp({
    create: {
      width: tileSize,
      height: tileSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    }
  });

  // Рендеринг маршрутов
  const svgPaths = Array.from(featuresToRender).map(featureIndex => {
    const feature = geojsonCache.features[featureIndex];
    const path = feature.geometry.coordinates.map(coord => {
      const [lon, lat] = coord;
      const px = ((lon + 180) / 360) * Math.pow(2, z) * tileSize - x * tileSize;
      const py = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * Math.pow(2, z) * tileSize - y * tileSize;
      return `${px},${py}`;
    }).join(' ');

    return `<polyline points="${path}" stroke="red" stroke-width="2" fill="none"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}">${svgPaths}</svg>`;

  return image.composite([{ input: Buffer.from(svg), blend: 'over' }]).png().toBuffer();
}

// Функция для получения пути кэшированного тайла
function getTilePath(z, x, y) {
  return path.join(tileCacheDir, `${z}-${x}-${y}.png`);
}

const app = express();
const port = 80;

// Инициализация кэша перед запуском сервера
initializeCache();

// Маршрут для рендеринга тайлов
app.get('/tiles/:z/:x/:y.png', async (req, res) => {
  const { z, x, y } = req.params;
  const tilePath = getTilePath(z, x, y);

  // Проверка наличия кэшированного тайла
  if (fs.existsSync(tilePath)) {
    res.sendFile(tilePath);
    return;
  }

  try {
    const tile = await renderTile(parseInt(z), parseInt(x), parseInt(y));
    fs.writeFileSync(tilePath, tile);
    res.setHeader('Content-Type', 'image/png');
    res.send(tile);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Маршрут для получения центра и масштаба карты
app.get('/map-info', (req, res) => {
  res.json({
    center: mapCenter,
    zoom: mapZoom
  });
});

// Статическая папка для клиентской части
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Tile server is running on http://localhost:${port}`);
});