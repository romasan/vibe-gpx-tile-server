// const fs = require('fs');

const sessions = {};

const getSession = (token) => {
	return sessions[token];
}

const addSession = (token, payload) => {
	sessions[token] = payload;

	// fs.writeFileSync(__dirname + '/sessions.json', JSON.stringify(sessions, null, 2));
}

module.exports = {
	getSession,
	addSession,
};
