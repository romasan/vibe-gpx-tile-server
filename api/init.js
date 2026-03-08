const { v4: uuid } = require('uuid');
const {
	getMapInfo,
} = require('../tiles');
const {
	getSession,
	addSession,
} = require('../session');
const {
	telegram: {
		token,
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
		res.json(getMapInfo());

		return;
	}

	const newSession = uuid();

	res.cookie('token', newSession);

	const payload = req.body;
	const params = Object.fromEntries(new URLSearchParams(payload));

	let user = {};

	try {
		user = JSON.parse(params.user);
	} catch (error) {
		console.log('Telegram mimiapp auth error: Failed parse user data');

		res.json({
			...getMapInfo(),
			error: true
		});

		return;
	}

	const success = checkTelegramAuth(params);

	if (success) {
		const token = getToken(req);

		addSession(token, user);

		res.json(getMapInfo());

		return;
	}

	console.log('Telegram auth error: Invalid hash');

	res.json({
		...getMapInfo(),
		error: true
	});
};

module.exports = {
	init,
};
