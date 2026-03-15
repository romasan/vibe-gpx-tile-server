const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const {
	getMapInfo,
	prefetchCache,
} = require('../tiles');
const {
	getSession,
	addSession,
} = require('../session');
const {
	telegram: {
		token,
		debugUserId,
	},
} = require('../config.json');

const checkTelegramAuth = (query) => {
	const secret = crypto.createHmac('sha256', 'WebAppData')
		.update(token)
		.digest();
	const checkString = Object.keys(query)
		.filter(key => key !== 'hash')
		.sort()
		.map(key => `${key}=${query[key]}`)
		.join('\n');
	const hash = crypto.createHmac('sha256', secret)
		.update(checkString)
		.digest('hex');

	return hash === query.hash;
};

const init = (req, res) => {
	const token = req.cookies.token;
	const session = getSession(token);

	if (session) {
		prefetchCache(session.id);

		res.json(getMapInfo(session.id));

		return;
	}

	const newSession = uuid();

	res.cookie('token', newSession);

	const payload = req.body;
	const params = Object.fromEntries(new URLSearchParams(payload));

	let success = null;

	try {
		success = checkTelegramAuth(params);
	} catch (error) {}

	if (success) {
		let user = {};

		try {
			user = JSON.parse(params.user);
		} catch (error) {
			console.log('Telegram mimiapp auth error: Failed parse user data');

			res.json({
				error: true
			});

			return;
		}

		addSession(newSession, user);

		prefetchCache(user.id);

		res.json({
			...getMapInfo(user.id),
			...(user.id === debugUserId ? { showDebug: true } : {}),
		});

		return;
	}

	console.log('Telegram auth error: Invalid hash');

	if (debugUserId && !params?.user) {
		prefetchCache(debugUserId);
	}

	res.json({
		error: true,
	});
};

module.exports = {
	init,
};
