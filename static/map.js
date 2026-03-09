import {
	debounce,
	throttle,
} from '/utils.js';

export class MapRenderer {
	constructor(data) {
		this.osmCanvas = document.getElementById('osm-canvas');
		this.gpxCanvas = document.getElementById('gpx-canvas');
		this.osmCtx = this.osmCanvas.getContext('2d');
		this.gpxCtx = this.gpxCanvas.getContext('2d');
		this.osmCtx.imageSmoothingEnabled = false;
		this.gpxCtx.imageSmoothingEnabled = false;

		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.osmCanvas.width = this.width;
		this.osmCanvas.height = this.height;
		this.gpxCanvas.width = this.width;
		this.gpxCanvas.height = this.height;

		this.center = data?.center || [0, 0];
		this.zoom = data?.zoom || 2;
		this.zoomFloat = this.zoom;
		this.tileSize = 256;

		this.markers = [];

		this.isDragging = 0;
		this.lastX = 0;
		this.lastY = 0;
		this.lastDistance = 0;

		this.cache = new Map();
		this.loading = new Map();

		this.debounceRender = debounce(() => this.render());

		this.loadMapInfo();
		this.setupEventListeners();

		const resizeCallback = debounce(() => this.handleResize());

		window.addEventListener('resize', resizeCallback);

		this.render();
	}

	async loadMapInfo() {
		try {
			const response = await fetch('/info');
			const data = await response.json();

			this.center = data.center;
			this.zoom = data.zoom;

			this.render();
		} catch (error) {
			console.error('Error loading map info:', error);
		}
	}

	handleResize() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.osmCanvas.width = this.width;
		this.osmCanvas.height = this.height;
		this.gpxCanvas.width = this.width;
		this.gpxCanvas.height = this.height;
		this.render();
	}

	// Преобразование географических координат в пиксели
	latLngToPixel(lat, lng) {
		const scale = Math.pow(2, this.zoom) * (1 + (this.zoomFloat % 1));
		const x = ((lng + 180) / 360) * scale * this.tileSize;
		const y = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * scale * this.tileSize;

		return [x, y];
	}

	// Преобразование пиксельных координат в географические
	pixelToLatLng(x, y) {
		const worldSize = Math.pow(2, this.zoom) * (1 + (this.zoomFloat % 1)) * this.tileSize;

		// Долгота: линейное преобразование
		const lng = (x / worldSize) * 360 - 180;

		// Широта: обратная проекция Меркатора
		const n = Math.PI - (2 * Math.PI * y) / worldSize;
		const latRad = Math.atan(Math.sinh(n));
		const lat = latRad * 180 / Math.PI;

		// Ограничение широты до допустимого диапазона Web Mercator
		const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));

		return [clampedLat, lng];
	}

	async fetchImage(url) {
		const controller = new AbortController();

		this.loading.set(url, controller);

		const response = await fetch(url, { signal: controller.signal });

		if (response.status === 204) {
			this.cache.set(url, 'empty');

			return;
		}

		if (response.ok) {
			const blob = await response.blob();
			const img = new Image();

			img.src = URL.createObjectURL(blob);

			if (!this.cache.get(url)) {
				this.cache.set(url, img);
			}

			this.debounceRender();
		}
	}

	breakFetch(list) {
		this.loading.forEach((controller, key) => {
			if (!list.includes(key)) {
				controller.abort();
				this.loading.delete(key);
			}
		});
	}

	renderTiles(ctx, route) {
		ctx.clearRect(0, 0, this.width, this.height);

		const scale = (1 + (this.zoomFloat % 1));
		const tileSize = this.tileSize * scale;

		const numTiles = Math.floor(Math.pow(2, this.zoom)); // Количество тайлов по оси при данном зуме

		const tilesPerRow = Math.ceil(this.width / tileSize) + 1;
		const tilesPerCol = Math.ceil(this.height / tileSize) + 1;

		const centerX = this.width / 2;
		const centerY = this.height / 2;

		// Вычисляем центральные координаты в пикселях
		const centerPixel = this.latLngToPixel(this.center[0], this.center[1]);

		const list = [];

		// Рисуем тайлы OpenStreetMap
		for (let y = 0; y < tilesPerCol; y++) {
			for (let x = 0; x < tilesPerRow; x++) {
				let offsetX = centerX - centerPixel[0];
				let offsetY = centerY - centerPixel[1];
				let tileX = Math.floor((x * tileSize - offsetX) / tileSize);
				let tileY = Math.floor((y * tileSize - offsetY) / tileSize);

				// if (ctx.canvas.id.includes('osm')) {
				// 	// const [, , z, x, y] = url.split(/[\/\.]+/ig);

				// 	const x1 = Math.round(tileX * tileSize + offsetX);
				// 	const y1 = Math.round(tileY * tileSize + offsetY);
				// 	const x2 = x1 + Math.ceil(tileSize);
				// 	const y2 = y1 + Math.ceil(tileSize);

				// 	ctx.strokeStyle = 'green';
				// 	ctx.lineWidth = 1;

				// 	ctx.beginPath();
				// 	ctx.moveTo(x1, y1 + 30);
				// 	ctx.lineTo(x1, y1);
				// 	ctx.lineTo(x1 + 30, y1);
				// 	ctx.stroke();

				// 	ctx.beginPath();
				// 	ctx.moveTo(x2, y1 + 30);
				// 	ctx.lineTo(x2, y1);
				// 	ctx.lineTo(x2 - 30, y1);
				// 	ctx.stroke();

				// 	ctx.beginPath();
				// 	ctx.moveTo(x1 + 30, y2);
				// 	ctx.lineTo(x1, y2);
				// 	ctx.lineTo(x1, y2 - 30);
				// 	ctx.stroke();

				// 	ctx.beginPath();
				// 	ctx.moveTo(x2, y2 - 30);
				// 	ctx.lineTo(x2, y2);
				// 	ctx.lineTo(x2 - 30, y2);
				// 	ctx.stroke();
				// }

				// Проверяем, чтобы координаты тайла были корректными
				if (tileX >= 0 && tileY >= 0 && tileX < numTiles && tileY < numTiles) {
					const url = route(this.zoom, tileX, tileY);

					list.push(url);

					const imgCache = this.cache.get(url);

					if (imgCache) {
						if (imgCache !== 'empty') {
							ctx.drawImage(
								imgCache,
								Math.round(tileX * tileSize + offsetX),
								Math.round(tileY * tileSize + offsetY),
								Math.ceil(tileSize),
								Math.ceil(tileSize),
							);
						}
					}

					if (imgCache) {
						continue;
					}

					const loading = this.loading.get(url);

					if (loading) {
						continue;
					}

					this.fetchImage(url);
				}
			}
		}

// 		if (ctx.canvas.id.includes('osm')) {
// 			const centerX = Math.floor(this.width / 2);
// 			const centerY = Math.floor(this.height / 2);

// 			ctx.strokeStyle = 'red';
// 			ctx.lineWidth = 1;

// 			ctx.beginPath();
// 			ctx.moveTo(centerX, centerY - 10);
// 			ctx.lineTo(centerX, centerY + 10);
// 			ctx.stroke();

// 			ctx.beginPath();
// 			ctx.moveTo(centerX - 10, centerY);
// 			ctx.lineTo(centerX + 10, centerY);
// 			ctx.stroke();

// 			ctx.fillText(
// 				this.center.join(', '),
// 				Math.floor(centerX),
// 				Math.floor(centerY),
// 			);

// 			ctx.textAlign = 'right';
// 			`${this.center.join(', ')}
// width = ${this.width}
// height = ${this.height}
// zoom = ${this.zoom}
// zoomFloat = ${this.zoomFloat}
// tileSize = ${tileSize}
// numTiles = ${numTiles}
// tilesPerRow = ${tilesPerRow}
// tilesPerCol = ${tilesPerCol}
// centerPixel = ${centerPixel.join(', ')}`
// 				.split('\n').forEach((line, index) => {
// 					ctx.fillText(line, this.width - 5, 10 + index * 10);
// 				});
// 		}

		return list;
	}

	// Рендеринг тайлов OpenStreetMap
	renderOSMTiles() {
		return this.renderTiles(
			this.osmCtx,
			// (zoom, tileX, tileY) => `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
			(zoom, tileX, tileY) => `/osm/${zoom}/${tileX}/${tileY}.png`,
		);
	}

	// Рендеринг GPX-маршрутов
	renderGPXTiles() {
		return this.renderTiles(
			this.gpxCtx,
			(zoom, tileX, tileY) => `/tile/${zoom}/${tileX}/${tileY}.png`,
		);
	}

	render() {
		const osmList = this.renderOSMTiles();
		const gpxList = this.renderGPXTiles();

		this.renderMarkers();

		// this.breakFetch(osmList.concat(gpxList));
	}

	/**
	 * Конвертирует экранные координаты в географические
	 * С учётом дробного зума (zoomFloat)
	 * @param {number} screenX - X относительно canvas
	 * @param {number} screenY - Y относительно canvas
	 * @returns {[number, number]} [lat, lng]
	 */
	screenToLatLng(screenX, screenY) {
		const fractionalZoom = this.zoomFloat % 1;
		const renderScale = 1 + fractionalZoom; // Множитель, используемый при рендеринге

		const centerX = this.width / 2;
		const centerY = this.height / 2;

		// Получаем мировые координаты центра карты на ЦЕЛОМ уровне зума
		const centerWorld = this.latLngToPixel(this.center[0], this.center[1], this.zoom);

		// Конвертируем смещение на экране в мировые пиксели (на целочисленном зуме)
		// Делим на renderScale, чтобы компенсировать масштабирование при рендеринге
		const worldX = centerWorld[0] + (screenX - centerX) / renderScale;
		const worldY = centerWorld[1] + (screenY - centerY) / renderScale;

		// Конвертируем мировые пиксели в географические координаты
		// Важно: передаём this.zoom (целый), т.к. worldX/worldY рассчитаны для него
		return this.pixelToLatLng(worldX, worldY, this.zoom);
	}

	setupEventListeners() {
		const isMobile = 'ontouchstart' in window;

		const dragStartCallback = (e) => {
			if (e.touches && e.touches.length > 1) {
				return;
			}

			this.isDragging = Date.now();
			this.lastX = e.touches?.[0]?.clientX || e.clientX;
			this.lastY = e.touches?.[0]?.clientY || e.clientY;
			this.gpxCanvas.style.cursor = 'grabbing';
		};

		const dragCallback = (e) => {
			if (e.touches && e.touches.length > 1) {
				const touch1 = e.touches[0];
				const touch2 = e.touches[1];
				const dx = touch1.clientX - touch2.clientX;
				const dy = touch1.clientY - touch2.clientY;
				const currentDistance = Math.sqrt(dx * dx + dy * dy);

				if (!this.lastDistance) {
					this.lastDistance = currentDistance;
				} else {
					const scaleFactor = currentDistance / this.lastDistance;

					this.zoomFloat = Math.max(2, Math.min(19,
						this.zoomFloat * scaleFactor,
					));

					const newZoom = Math.floor(this.zoomFloat);

					if (newZoom !== this.zoom) {
						this.zoom = newZoom;
					}

					this.lastDistance = currentDistance;
				}

				this.render();

				return;
			}

			if (this.isDragging) {
				const dx = (e.touches?.[0]?.clientX || e.clientX) - this.lastX;
				const dy = (e.touches?.[0]?.clientY || e.clientY) - this.lastY;
				const scale = Math.pow(2, this.zoom);
				const latPerPixel = 360 / (scale * this.tileSize);
				const lngPerPixel = 360 / (scale * this.tileSize);

				// Применяем смещение к центру карты (в обратном направлении)
				this.center[0] = Math.max(-85, Math.min(85, this.center[0] + dy * latPerPixel));
				this.center[1] = Math.max(-180, Math.min(180, this.center[1] - dx * lngPerPixel));

				// this.center[0] += dy * latPerPixel;
				// this.center[1] -= dx * lngPerPixel;

				this.lastX = e.touches?.[0]?.clientX || e.clientX;
				this.lastY = e.touches?.[0]?.clientY || e.clientY;

				this.render();
			}
		};

		const dragEndCallback = (e) => {
			const dx = (e.touches?.[0]?.clientX || e.clientX) - this.lastX;
			const dy = (e.touches?.[0]?.clientY || e.clientY) - this.lastY;

			if (Math.abs(dx) + Math.abs(dy) === 0 && (Date.now() - this.isDragging) > 2000) {
				// TODO show menu
			}

			// const centerX = this.width / 2;
			// const centerY = this.height / 2;
			// const centerPixel = this.latLngToPixel(this.center[0], this.center[1]);

			// const worldX = e.clientX - centerX + centerPixel[0];
			// const worldY = e.clientY - centerY + centerPixel[1];

			// let [lat, lng] = this.pixelToLatLng(worldX, worldY);

			// console.log(`📍 Latitude: ${lat.toFixed(6)}, Longitude: ${lng.toFixed(6)}`);

			// this.addMarker(lat, lng);

			// this.center[0] = lat;
			// this.center[1] = lng;

			this.render();

			this.isDragging = 0;
			this.lastDistance = 0;
			this.gpxCanvas.style.cursor = 'default';
		};

		const wheelCallback = throttle((e) => {
			e.preventDefault();

			// const centerX = this.width / 2;
			// const centerY = this.height / 2;
			// const scale = Math.pow(2, this.zoom);
			// const latPerPixel = 360 / (scale * this.tileSize);
			// const lngPerPixel = 360 / (scale * this.tileSize);
			// const dx = e.clientX - centerX;
			// const dy = e.clientY - centerY;

			// this.center[0] -= dy * latPerPixel * (e.deltaY > 0 ? -1 : 1) * .05;
			// this.center[1] += dx * lngPerPixel * (e.deltaY > 0 ? -1 : 1) * .05;

			this.zoomFloat = Math.max(2, Math.min(19,
				this.zoomFloat + (e.deltaY > 0 ? -.1 : .1)
			));

			const newZoom = Math.floor(this.zoomFloat);

			if (newZoom !== this.zoom) {
				this.zoom = newZoom;
			}

			this.render();
		});

		if (isMobile) {
			this.gpxCanvas.addEventListener('touchstart', dragStartCallback);
			this.gpxCanvas.addEventListener('touchmove', dragCallback);
			this.gpxCanvas.addEventListener('touchend', dragEndCallback);
		} else {
			this.gpxCanvas.addEventListener('mousedown', dragStartCallback);
			this.gpxCanvas.addEventListener('mousemove', dragCallback);
			this.gpxCanvas.addEventListener('mouseup', dragEndCallback);

			this.gpxCanvas.addEventListener('mouseleave', () => {
				this.isDragging = false;
				this.gpxCanvas.style.cursor = 'default';
			});

			this.gpxCanvas.addEventListener('wheel', wheelCallback);
		}

	}

	/**
	 * Добавляет маркер на карту по координатам
	 * @param {number} lat - Широта
	 * @param {number} lng - Долгота
	 * @param {Object} options - Опции: color, radius и др.
	 * @returns {boolean} - true если маркер видим на текущем вьюпорте
	 */
	addMarker(lat, lng, options = {}) {
		// Ограничение широты в допустимом диапазоне Web Mercator
		const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));

		const marker = {
			lat: clampedLat,
			lng: ((lng + 180) % 360 + 360) % 360 - 180, // Нормализация долготы
			color: options.color || '#ff3b30',
			radius: options.radius || 6,
			stroke: options.stroke || '#ffffff',
			strokeWidth: options.strokeWidth || 2,
			...options
		};

		this.markers.push(marker);
		this.render();

		// Проверяем видимость маркера
		return this.isPointVisible(marker.lat, marker.lng);
	}

	/**
	 * Проверяет, видна ли точка в текущем вьюпорте
	 * @private
	 */
	isPointVisible(lat, lng) {
		const [worldX, worldY] = this.latLngToPixel(lat, lng);
		const centerPixel = this.latLngToPixel(this.center[0], this.center[1]);
		const centerX = this.width / 2;
		const centerY = this.height / 2;
		const screenX = worldX - centerPixel[0] + centerX;
		const screenY = worldY - centerPixel[1] + centerY;
		const margin = 50; // Запас для плавного появления

		return (
			screenX >= -margin &&
			screenX <= this.width + margin &&
			screenY >= -margin &&
			screenY <= this.height + margin
		);
	}

	/**
	 * Отрисовывает все сохранённые маркеры на GPX-канвасе
	 * @private
	 */
	renderMarkers() {
		if (this.markers.length === 0) {
			return;
		}

		const centerX = this.width / 2;
		const centerY = this.height / 2;
		const centerPixel = this.latLngToPixel(this.center[0], this.center[1]);

		for (const marker of this.markers) {
			const [worldX, worldY] = this.latLngToPixel(marker.lat, marker.lng);

			// Конвертация мировых координат в экранные
			const screenX = worldX - centerPixel[0] + centerX;
			const screenY = worldY - centerPixel[1] + centerY;

			// Пропускаем маркеры далеко за пределами экрана
			const margin = 100;

			if (
				screenX < -margin ||
				screenX > this.width + margin ||
				screenY < -margin ||
				screenY > this.height + margin
			) {
				continue;
			}

			this.gpxCtx.save();
			this.gpxCtx.beginPath();
			this.gpxCtx.arc(screenX, screenY, marker.radius, 0, Math.PI * 2);
			this.gpxCtx.fillStyle = marker.color;
			this.gpxCtx.fill();

			if (marker.stroke) {
				this.gpxCtx.strokeStyle = marker.stroke;
				this.gpxCtx.lineWidth = marker.strokeWidth;
				this.gpxCtx.stroke();
			}

			this.gpxCtx.restore();
		}
	}
}
