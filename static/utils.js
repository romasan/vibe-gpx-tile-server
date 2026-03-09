export function debounce(func, delay = 100) {
	let timeoutId;

	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
};

export function throttle(func, limit = 16) {
	let inThrottle;
	return function (...args) {
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			setTimeout(() => inThrottle = false, limit);
		}
	};
}

export function getRandomHexColor() {
	return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}
