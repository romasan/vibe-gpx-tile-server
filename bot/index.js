const { Telegraf } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const { initializeCachePerUser } = require('../tiles');

const { telegram: { token } } = require('../config.json');

const gpxDir = path.join(__dirname, '../gpx-files');

const init = () => {
	const bot = new Telegraf(token);

	// Убедимся, что папка для треков существует
	(async () => {
		try {
			await fs.access(gpxDir);
		} catch {
			await fs.mkdir(gpxDir, { recursive: true });
		}
	})();

	// bot.start((ctx) => ctx.reply('Привет! Отправь мне GPX-файл или начни трансляцию геопозиции'));

	// Обработка документов (файлов)
	bot.on('document', async (ctx) => {
		const id = ctx.message.from.id;
		const document = ctx.message.document;
		const fileName = document.file_name || 'unknown.gpx';
		const ext = path.extname(fileName).toLowerCase();

		if (ext !== '.gpx') {
			return ctx.reply('неверный формат файла');
		}

		try {
			const fileLink = await ctx.telegram.getFileLink(document.file_id);
			const response = await fetch(fileLink);
			const arrayBuffer = await response.arrayBuffer();

			const buffer = Buffer.from(arrayBuffer);
			const dirPath = path.join(gpxDir, String(id));

			try {
				await fs.access(dirPath);
			} catch {
				await fs.mkdir(dirPath, { recursive: true });
			}

			const filePath = path.join(dirPath, fileName);

			await fs.writeFile(filePath, buffer);

			ctx.reply(`новый трек "${fileName}" добавлен`);

			initializeCachePerUser(String(id));
			// TODO clear cache files per user
			// refech cache
		} catch (err) {
			console.error('Ошибка при сохранении файла:', err);

			ctx.reply('Произошла ошибка при сохранении файла.');
		}
	});

	// Запуск бота
	bot.launch();

	console.log(`Telegram bot is running`);

	// Graceful shutdown
	process.once('SIGINT', () => bot.stop('SIGINT'));
	process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

module.exports = {
	init,
}
