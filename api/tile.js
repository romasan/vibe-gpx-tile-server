const fs = require('fs');
const {
	renderTile,
	getTileFeatureMap,
	getTilePath,
} = require('../tiles');
const { getSession } = require('../session');

const tile = async (req, res) => {
	const token = req.cookies.token;
	const session = getSession(token);
	const id = session?.id;

	// TODO
	// if (!id) {
	// 	res.status(204).send();

	// 	return;
	// }

	const { z, x, y } = req.params;
	const tileKey = `${z}-${x}-${y}`;

	console.log(`Get prite: ${z}-${x}-${y} for ID: "${id}"`)

	const tileFeatureMap = getTileFeatureMap();

	// Проверка, есть ли что рендерить
	if (!tileFeatureMap[tileKey] || tileFeatureMap[tileKey].size === 0) {
		res.status(204).send(); // Нет контента для рендеринга

		return;
	}

	const tilePath = getTilePath(z, x, y);

	// Проверка наличия кэшированного тайла
	if (fs.existsSync(tilePath)) {
		res.setHeader('Cache-Control', 'public, max-age=600'); // Кэширование в браузере на 10 минут
		res.sendFile(tilePath);

		return;
	}

	try {
		const tile = await renderTile(parseInt(z), parseInt(x), parseInt(y));

		fs.writeFileSync(tilePath, tile);

		res.setHeader('Content-Type', 'image/png');
		res.setHeader('Cache-Control', 'public, max-age=600'); // Кэширование в браузере на 10 минут
		res.send(tile);
	} catch (err) {
		res.status(500).send(err.message);
	}
};

module.exports = {
	tile,
};
