const path = require('path');

const admin = (req, res) => {
	res.sendFile(path.join(__dirname, '../static', 'admin.html'));
};

module.exports = {
	admin,
};
