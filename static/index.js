import { MapRenderer } from '/map.js';

const getLocation = () => new Promise((resolve) => {
	navigator.geolocation.getCurrentPosition(
		(position) => {
			const lat = position.coords.latitude;
            const lng = position.coords.longitude;

			resolve([lat, lng]);
		},
		// showError,
		// {
		// 	enableHighAccuracy: true, // Запрашивать высокую точность (GPS)
		// 	timeout: 5000,            // Тайм-аут 5 секунд
		// 	maximumAge: 0             // Не использовать кэшированные данные
		// }
	);
});

// Инициализируем карту при загрузке страницы
window.addEventListener('load', async () => {
	const tg = window?.Telegram?.WebApp;

	// if (!tg) {
	// 	document.location.href = 'https://t.me/mygpxbot';

	// 	return;
	// }

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

	const map = new MapRenderer(data);

	getLocation().then(([lat, lng]) => {
		map.addMarker(lat, lng);
	});
});
