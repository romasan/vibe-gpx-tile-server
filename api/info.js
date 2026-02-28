const {
	getMapInfo,
} = require('../tiles');

const info = (req, res) => {
  res.json(getMapInfo());
};

module.exports = {
    info,
};
