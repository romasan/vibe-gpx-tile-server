const fs = require('fs');
const path = require('path');

const gpxDir = path.join(__dirname, '../gpx-files');

const list = (req, res) => {
	const files = fs.readdirSync(gpxDir)
		.filter(file => file.endsWith('.gpx'));

	res.json(files);
};

module.exports = {
	list,
};
