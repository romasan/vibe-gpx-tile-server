const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const toGeoJSON = require('@mapbox/togeojson');
const { DOMParser } = require('xmldom');
const Progress = require('cli-progress');
const { simpleHash } = require('./utils');

const gpxDir = path.join(__dirname, 'gpx-files');
const cacheDir = path.join(__dirname, 'cache');

// Создание папки для кэшированных тайлов, если она не существует
if (!fs.existsSync(cacheDir)) {
	fs.mkdirSync(cacheDir, { recursive: true });
}

const tileSize = 256;
const cache = {};

const getTokenForFiles = (dirPath) => {
	const files = fs.readdirSync(dirPath)
		.filter(file => file.endsWith('.gpx'));

	return simpleHash(files.join(';')).toString();
};

const hasCache = (id) => {
	const dirPath = path.join(gpxDir, id);
	const key = getTokenForFiles(dirPath);
	const filePath = path.join(cacheDir, `${id}.json`);

	console.log('Check cache file', filePath);

	if (fs.existsSync(filePath)) {
		try {
			const json = JSON.parse(fs.readFileSync(filePath).toString());

			if (json.key === key) {
				// console.log('loaded from cache');

				return true;
			}
		} catch (error) {
			console.log('==== Error:', error);
		}
	}

	return false;
};

const saveCache = (id, payload) => {
	const dirPath = path.join(gpxDir, id);
	const key = getTokenForFiles(dirPath);
	const filePath = path.join(cacheDir,`${id}.json`);

	console.log('Save cache file', filePath);

	fs.writeFileSync(filePath, JSON.stringify({
		key,
		...payload,
	}));
};

const prefetchCache = (id) => {
	const filePath = path.join(cacheDir, `${id}.json`);

	console.log('Prefetch cache file', filePath);

	if (fs.existsSync(filePath)) {
		try {
			const json = JSON.parse(fs.readFileSync(filePath).toString());

			cache[id] = json;
		} catch (error) {
			console.log('Error:', error);
		}
	} else {
		console.log('Cache file not found', filePath);
	}
};

// Чтение и преобразование GPX в GeoJSON
function loadGPXFiles(id) {
	console.log('Load GPX files...');

	// const cache = getFeaturesCache(key);

	// if (cache) {
	// 	return { type: 'FeatureCollection', features: cache };
	// }

	const dirPath = path.join(gpxDir, id);
	const files = fs.readdirSync(dirPath)
		.filter(file => file.endsWith('.gpx'));

	const bar = new Progress.Bar();
	bar.start(files.length, 0);
	let count = 0;

	const geojsonFeatures = files.map(file => {
		bar.update(++count);

		const gpxData = fs.readFileSync(path.join(dirPath, file), 'utf8');
		const gpxDoc = new DOMParser().parseFromString(gpxData);
		const geojson = toGeoJSON.gpx(gpxDoc);

		return geojson.features;
	}).flat();

	bar.stop();

	// fs.writeFileSync(featuresCacheFile, JSON.stringify({ key, features: geojsonFeatures }));

	return { type: 'FeatureCollection', features: geojsonFeatures };
}

// Функция для вычисления пересечений маршрутов с тайлами
function calculateTileIntersections(geojson) {
	console.log('Calculate tile intersections...');

	const tileFeatureMap = {};

	let mapCenter = null;
	let mapZoom = null;
	let minLat = Infinity,
		maxLat = -Infinity,
		minLon = Infinity,
		maxLon = -Infinity;

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

	Object.keys(tileFeatureMap).forEach((key) => {
		tileFeatureMap[key] = Array.from(tileFeatureMap[key]);
	})

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

	return {
		tileFeatureMap,
		mapCenter,
		mapZoom,
	};
}

// Инициализация кэша при запуске сервера
function initializeCache() {
	fs.readdirSync(gpxDir)
		.forEach((id) => {
			if (!hasCache(id)) {
				const geojson = loadGPXFiles(id);
				const {
					tileFeatureMap,
					mapCenter,
					mapZoom,
				} = calculateTileIntersections(geojson);

				saveCache(id, {
					geojson,
					tileFeatureMap,
					mapCenter,
					mapZoom,
				});
			} else {
				console.log('load from cache');
			}
		})
	// foreach all folders with gpx filles
	// check cache for list of files in folder

	// if need update calc features and intersections
	// save caches

}

// Функция для рендеринга тайлов
function renderTile(z, x, y, id) {
	if (!cache[id]) {
		console.log('Error rander tile, cache not found', id, z, x, y);

		return null;
	}

	const time = Date.now();

	const tileKey = `${z}-${x}-${y}`;
	const featuresToRender = cache[id].tileFeatureMap[tileKey] || [];// new Set();

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
		const feature = cache[id].geojson.features[featureIndex];

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

		return `<polyline points="${path}" stroke="blue" stroke-width="1" fill="none" />`;
	}).join('');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}">${svgPaths}</svg>`;

	// fs.writeFileSync(`${__dirname}/cache/gpx-${z}-${x}-${y}.svg`, svg);

	console.log(`render tile "${tileKey}" for "${id}" at ${Date.now() - time} ms.`);

	return image.composite([{ input: Buffer.from(svg), blend: 'over' }])
		.png()
		.toBuffer();
}

// Функция для получения пути кэшированного тайла
function getTilePath(z, x, y, id) {
	return path.join(cacheDir, `gpx-${id}-${z}-${x}-${y}.png`);
}

// Удаление устаревших тайлов
function clearTileCache() {
	fs.readdirSync(cacheDir).forEach(file => {
		if (file.includes('gpx-')) {
			fs.unlinkSync(path.join(cacheDir, file));
		}
	});
}

const getMapInfo = (id) => ({
	center: cache[id].mapCenter,
	zoom: cache[id].mapZoom
});

const getTileFeatureMap = (id) => cache?.[id]?.tileFeatureMap;

// Инициализация кэша перед запуском сервера
initializeCache();

module.exports = {
	renderTile,
	clearTileCache,
	initializeCache,
	getMapInfo,
	getTileFeatureMap,
	getTilePath,
	prefetchCache,
};