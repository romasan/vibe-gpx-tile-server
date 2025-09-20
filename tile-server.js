const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const toGeoJSON = require('@mapbox/togeojson');
const { DOMParser } = require('xmldom');

// Путь к папке с GPX-файлами
const gpxDir = path.join(__dirname, 'gpx-files');

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

// Функция для рендеринга тайлов
async function renderTile(z, x, y) {
  const tileSize = 256;
  const geojson = loadGPXFiles();

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
  const svgPaths = geojson.features.map(feature => {
    if (feature.geometry.type === 'LineString') {
      const path = feature.geometry.coordinates.map(coord => {
        const [lon, lat] = coord;
        const px = ((lon + 180) / 360) * Math.pow(2, z) * tileSize - x * tileSize;
        const py = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * Math.pow(2, z) * tileSize - y * tileSize;
        return `${px},${py}`;
      }).join(' ');

      return `<polyline points="${path}" stroke="red" stroke-width="2" fill="none"/>`;
    }
    return '';
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}">${svgPaths}</svg>`;

  return image.composite([{ input: Buffer.from(svg), blend: 'over' }]).png().toBuffer();
}

const app = express();
const port = 80;

// Маршрут для рендеринга тайлов
app.get('/tiles/:z/:x/:y.png', async (req, res) => {
  const { z, x, y } = req.params;
  try {
    const tile = await renderTile(parseInt(z), parseInt(x), parseInt(y));
    res.setHeader('Content-Type', 'image/png');
    res.send(tile);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Статическая папка для клиентской части
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Tile server is running on http://localhost:${port}`);
});