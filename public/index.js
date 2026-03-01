function debounce(func, delay = 100) {
	let timeoutId;

	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
};

// function getRandomHexColor() {
// 	return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
// }

class MapRenderer {
	constructor() {
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

		this.center = [0, 0];
		this.zoom = 0;
		this.zoomFloat = -1;
		this.tileSize = 256;
		this.isDragging = false;
		this.lastX = 0;
		this.lastY = 0;
		this.osmTiles = [];
		this.gpxTiles = [];

		this.cache = new Map();
		this.loading = new Map();

		this.debounceRender = debounce(() => this.render());

		this.init();
	}

	init() {
		this.loadMapInfo();
		this.setupEventListeners();

		const resizeCallback = debounce(() => this.handleResize());

		window.addEventListener('resize', resizeCallback);
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
		const _scale = (1 + (this.zoomFloat % 1));
		const scale = Math.pow(2, zoom);
		const x = ((lng + 180) / 360) * scale * this.tileSize * _scale;
		const y = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * scale * this.tileSize * _scale;

		return [x, y];
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

		const tilesPerRow = Math.ceil(this.width / tileSize) + 1;
		const tilesPerCol = Math.ceil(this.height / tileSize) + 1;

		const centerX = this.width / 2;
		const centerY = this.height / 2;

		// Вычисляем центральные координаты в пикселях
		const centerPixel = this.latLngToPixel(this.center[0], this.center[1]);

		// Вычисляем смещение для центрирования
		const offsetX = centerX - centerPixel[0];
		const offsetY = centerY - centerPixel[1];

		const list = [];

		// Рисуем тайлы OpenStreetMap
		for (let y = 0; y < tilesPerCol; y++) {
			for (let x = 0; x < tilesPerRow; x++) {
				const tileX = Math.floor((x * tileSize - offsetX) / tileSize);
				const tileY = Math.floor((y * tileSize - offsetY) / tileSize);

				// Проверяем, чтобы координаты тайла были корректными
				if (tileX >= 0 && tileY >= 0) {
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

					// if (url.includes('osm')) {
					// 	const [, , z, x, y] = url.split(/[\/\.]+/ig);

					// 	ctx.fillText(
					// 		`${z}-${x}-${y} (${String(!!imgCache)})`,
					// 		Math.round(tileX * this.tileSize + offsetX),
					// 		Math.round(tileY * this.tileSize + offsetY) + 10,
					// 	);
					// }

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
		this.gpxCanvas.addEventListener('mousedown', (e) => {
			this.isDragging = true;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			this.gpxCanvas.style.cursor = 'grabbing';
		});

		this.gpxCanvas.addEventListener('mousemove', (e) => {
			if (this.isDragging) {
				const dx = e.clientX - this.lastX;
				const dy = e.clientY - this.lastY;
				const scale = Math.pow(2, this.zoom);
				const latPerPixel = 360 / (scale * this.tileSize);
				const lngPerPixel = 360 / (scale * this.tileSize);

				// Применяем смещение к центру карты (в обратном направлении)
				this.center[0] += dy * latPerPixel;
				this.center[1] -= dx * lngPerPixel;

				this.lastX = e.clientX;
				this.lastY = e.clientY;

				this.render();
			}
		});

		this.gpxCanvas.addEventListener('mouseup', () => {
			this.isDragging = false;
			this.gpxCanvas.style.cursor = 'default';
		});

		this.gpxCanvas.addEventListener('mouseleave', () => {
			this.isDragging = false;
			this.gpxCanvas.style.cursor = 'default';
		});

		this.gpxCanvas.addEventListener('wheel', (e) => {
			e.preventDefault();

			if (this.zoomFloat < 0) {
				this.zoomFloat = this.zoom;
			}

			this.zoomFloat = Math.max(1, Math.min(19,
				this.zoomFloat + (e.deltaY > 0 ? -.1 : .1)
			));

			const newZoom = Math.floor(this.zoomFloat);

			if (newZoom !== this.zoom) {
				this.zoom = newZoom;
			}

			this.render();
		});
	}
}

// Инициализируем карту при загрузке страницы
window.addEventListener('load', () => {
	const map = new MapRenderer();
});
