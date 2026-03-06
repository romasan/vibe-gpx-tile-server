const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const tileCacheDir = path.join(__dirname, '../cache');

const osm = async (req, res) => {
	const { z, x, y } = req.params;

	const tilePath = path.join(tileCacheDir, `osm-${z}-${x}-${y}.png`);

	// Проверка наличия кэшированного тайла
	if (fs.existsSync(tilePath)) {
		res.setHeader('Cache-Control', 'public, max-age=600'); // Кэширование в браузере на 10 минут
		res.sendFile(tilePath);

		return;
	}

	try {
		const response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
		
		if (!response.ok) {
			res.status(500).send(response.error);

			return;
		}
		
		// Читаем тело ответа как бинарные данные
		const buffer = await response.arrayBuffer();
		
		// Преобразуем ArrayBuffer в Buffer для записи в файл
		const tileBuffer = Buffer.from(buffer);
		
		fs.writeFileSync(tilePath, tileBuffer);

		res.setHeader('Content-Type', 'image/png');
		res.setHeader('Cache-Control', 'public, max-age=600'); // Кэширование в браузере на 10 минут
		res.send(tileBuffer);
	} catch (err) {
		res.status(500).send(err.message);
	}
};

module.exports = {
	osm,
};
