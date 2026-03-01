const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const toGeoJSON = require('@mapbox/togeojson');
const { DOMParser } = require('xmldom');
const Progress = require('cli-progress');
const { simpleHash } = require('./utils');

const gpxDir = path.join(__dirname, 'gpx-files');
const tileCacheDir = path.join(__dirname, 'cache');
const featuresCacheFile = __dirname + '/features-cache.json';

// Создание папки для кэшированных тайлов, если она не существует
if (!fs.existsSync(tileCacheDir)) {
	fs.mkdirSync(tileCacheDir, { recursive: true });
}

const tileSize = 256;

// Кэш для данных GeoJSON
let geojsonCache = null;
let tileFeatureMap = {};
let mapCenter = null;
let mapZoom = null;

const getFeaturesCache = (key) => {
	if (fs.existsSync(featuresCacheFile)) {
		try {
			const json = JSON.parse(fs.readFileSync(featuresCacheFile).toString());

			if (json.key === key) {
				console.log('loaded from cache');

				return json.features;
			}
		} catch (error) {
			console.log('==== Error:', error);
		}
	}

	return null;
};

// Чтение и преобразование GPX в GeoJSON
function loadGPXFiles() {
	const files = fs.readdirSync(gpxDir)
		.filter(file => file.endsWith('.gpx'));
	const key = simpleHash(files.join(';')).toString();

	console.log('loadGPXFiles...');

	const cache = getFeaturesCache(key);

	if (cache) {
		return { type: 'FeatureCollection', features: cache };
	}

	const bar = new Progress.Bar();
	bar.start(files.length, 0);
	let count = 0;

	const geojsonFeatures = files.map(file => {
		bar.update(++count);

		const gpxData = fs.readFileSync(path.join(gpxDir, file), 'utf8');
		const gpxDoc = new DOMParser().parseFromString(gpxData);
		const geojson = toGeoJSON.gpx(gpxDoc);

		return geojson.features;
	}).flat();

	bar.stop();

	fs.writeFileSync(featuresCacheFile, JSON.stringify({ key, features: geojsonFeatures }));

	return { type: 'FeatureCollection', features: geojsonFeatures };
}

// Функция для вычисления пересечений маршрутов с тайлами
function calculateTileIntersections(geojson) {
	tileFeatureMap = {}; // Очистка карты перед пересчетом
	let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

	console.log('calculateTileIntersections...');
	const bar = new Progress.Bar();
	bar.start(geojson.features.length, 0);

	geojson.features.forEach((feature, featureIndex) => {
		bar.update(featureIndex);

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

	bar.stop();

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
function renderTile(z, x, y) {
	const time = Date.now();

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
	const svgPaths = Array.from(featuresToRender).map((featureIndex) => {
		const feature = geojsonCache.features[featureIndex];

		// Проверка на существование данных
		if (!feature) {
			return '';
		}

		const path = feature.geometry.coordinates.map((coord) => {
			const [lon, lat] = coord;
			const px = ((lon + 180) / 360) * Math.pow(2, z) * tileSize - x * tileSize;
			const py = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * Math.pow(2, z) * tileSize - y * tileSize;

			return `${px},${py}`;
		}).join(' ');

		return `<polyline points="${path}" stroke="blue" stroke-width="2" fill="none" />`;
	}).join('');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}">${svgPaths}</svg>`;

	console.log(`render tile "${tileKey}" at ${Date.now() - time} ms.`);

	return image.composite([{ input: Buffer.from(svg), blend: 'over' }])
		.png()
		.toBuffer();
}

// Функция для получения пути кэшированного тайла
function getTilePath(z, x, y) {
	return path.join(tileCacheDir, `gpx-${z}-${x}-${y}.png`);
}

// Удаление устаревших тайлов
function clearTileCache() {
	fs.readdirSync(tileCacheDir).forEach(file => {
		if (file.includes('gpx-')) {
			fs.unlinkSync(path.join(tileCacheDir, file));
		}
	});
}

const getMapInfo = () => ({
	center: mapCenter,
	zoom: mapZoom
});

const getTileFeatureMap = () => tileFeatureMap;

// Инициализация кэша перед запуском сервера
initializeCache();

module.exports = {
	renderTile,
	clearTileCache,
	initializeCache,
	getMapInfo,
	getTileFeatureMap,
	getTilePath,
};