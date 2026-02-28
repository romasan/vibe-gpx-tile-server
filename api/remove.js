const fs = require('fs');
const path = require('path');
const {
	clearTileCache,
	initializeCache,
} = require('../tiles');

const remove = (req, res) => {
	const fileName = req.params.fileName;
	const filePath = path.join(gpxDir, fileName);

	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);

		clearTileCache();
		initializeCache();

		res.send('Файл удален и кэш обновлен.');
	} else {
		res.status(404).send('Файл не найден.');
	}
};

module.exports = {
	remove,
};
