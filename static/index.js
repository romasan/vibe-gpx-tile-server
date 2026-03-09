import { MapRenderer } from '/map.js';

// Инициализируем карту при загрузке страницы
window.addEventListener('load', async () => {
	const tg = window?.Telegram?.WebApp;

	const resp = await fetch('/start', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		credentials: 'include',
		body: tg?.initData,
	});

	const data = await resp.json();

	tg?.expand();
	// tg.setBackgroundColor('#d9d7ff');
	// tg.setHeaderColor('#d9d7ff');

	new MapRenderer(data);
});
