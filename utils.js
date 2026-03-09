function simpleHash(str) {
	let hash = 0;

	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // Преобразование в 32bit integer
	}

	return hash;
};

// Функция для создания GPX содержимого с несколькими точками
function createFullGPXContent(locations, fileName) {
	let trkpts = '';

	locations.forEach(loc => {
		trkpts += `\
				<trkpt lat="${loc.latitude}" lon="${loc.longitude}">
					<time>${loc.timestamp}</time>
				</trkpt>
	`;
	});

	return `<?xml version="1.0" encoding="UTF-8"?>
	<gpx version="1.1" creator="GPX Tile Server">
		<trk>
			<name>${fileName}</name>
			<trkseg>
	${trkpts}
			</trkseg>
		</trk>
	</gpx>`;
}

module.exports = {
	simpleHash,
}
