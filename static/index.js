function debounce(func, delay = 100) {
	let timeoutId;

	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
};

function throttle(func, limit = 16) {
	let inThrottle;
	return function (...args) {
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			setTimeout(() => inThrottle = false, limit);
		}
	};
}

// function getRandomHexColor() {
// 	return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
// }

class MapRenderer {
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
	latLngToPixel(lat, lng, zoom = this.zoom) {
		const scale = Math.pow(2, zoom) * (1 + (this.zoomFloat % 1));
		const x = ((lng + 180) / 360) * scale * this.tileSize;
		const y = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * scale * this.tileSize;

		return [x, y];
	}

	// Преобразование пиксельных координат в географические
	pixelToLatLng(x, y, zoom = this.zoomFloat) {
		const worldSize = Math.pow(2, zoom) * this.tileSize;

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
		// centerPixel = ${centerPixel.join(', ')}
		// `
		// 			.split('\n').forEach((line, index) => {
		// 				ctx.fillText(line, this.width - 5, 10 + index * 10);
		// 			});
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

		// this.breakFetch(osmList.concat(gpxList));
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

			// const dx = e.clientX - centerX;
			// const dy = e.clientY - centerY;

			// const scale = Math.pow(2, this.zoom);
			// const lpp = 360 / (scale * this.tileSize);

			// // Применяем смещение к центру карты (в обратном направлении)
			// const newCenterY = this.center[0] - dy * lpp;
			// const newCenterX = this.center[1] + dx * lpp;

			// // this.center[0] -= dy * latPerPixel * (e.deltaY > 0 ? -1 : 1) * .05;
			// // this.center[1] += dx * lngPerPixel * (e.deltaY > 0 ? -1 : 1) * .05;

			// console.log('==== mouseup', {
			// 	dx,
			// 	dy,
			// 	zoom: this.zoomFloat,
			// 	newCenterX,
			// 	newCenterY,
			// });

			// this.center[0] = newCenterY;
			// this.center[1] = newCenterX;

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
}

// Инициализируем карту при загрузке страницы
window.addEventListener('load', async () => {
	const tg = window?.Telegram?.WebApp;

	const resp = await fetch('/start', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		credentials: 'include',
		body: tg?.initData,
	});

	const data = await resp.json();

	tg?.expand();
	// tg.setBackgroundColor('#d9d7ff');
	// tg.setHeaderColor('#d9d7ff');

	new MapRenderer(data);
});
