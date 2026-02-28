const path = require('path');

const admin = (req, res) => {
	res.sendFile(path.join(__dirname, '../public', 'admin.html'));
};

module.exports = {
	admin,
};
