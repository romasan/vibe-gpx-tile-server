const fs = require('fs');
const path = require('path');
const {
	clearTileCache,
	initializeCache,
} = require('../tiles');

const gpxDir = path.join(__dirname, '../gpx-files');

const upload = (req, res) => {
	req.files.forEach(file => {
		const targetPath = path.join(gpxDir, file.originalname);

		fs.renameSync(file.path, targetPath);
	});

	// Очистка кэша тайлов и обновление данных
	clearTileCache();
	initializeCache();

	res.send('Файлы загружены и кэш обновлен.');
};

module.exports = {
	upload,
};
