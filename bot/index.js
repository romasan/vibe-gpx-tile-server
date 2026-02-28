const { Telegraf, Markup } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');

// Токен бота от @BotFather
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const TRACKS_DIR = './tracks';

// Создаём бота
const bot = new Telegraf(BOT_TOKEN);

// Убедимся, что папка для треков существует
(async () => {
  try {
    await fs.access(TRACKS_DIR);
  } catch {
    await fs.mkdir(TRACKS_DIR, { recursive: true });
  }
})();

// Хранилище для пагинации (в реальном проекте лучше использовать БД)
const paginationState = new Map(); // chatId => { offset }

// Вспомогательная функция: получить список файлов .gpx
async function getTrackFiles() {
  const files = await fs.readdir(TRACKS_DIR);
  return files
    .filter(file => path.extname(file).toLowerCase() === '.gpx')
    .sort(); // сортируем по имени
}

// Форматирование списка файлов с нумерацией
function formatFileList(files, startNumber = 1) {
  return files.map((file, i) => `${startNumber + i}. ${file}`).join('\n');
}

// Команда /start
bot.start((ctx) => ctx.reply('Привет! Отправь мне GPX-файл или используй команды:\n/list — список треков\n/del N — удалить трек по номеру'));

// Обработка документов (файлов)
bot.on('document', async (ctx) => {
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

    const filePath = path.join(TRACKS_DIR, fileName);
    await fs.writeFile(filePath, buffer);

    ctx.reply(`новый трек ${fileName} добавлен`);
  } catch (err) {
    console.error('Ошибка при сохранении файла:', err);
    ctx.reply('Произошла ошибка при сохранении файла.');
  }
});

// Команда /list
bot.command('list', async (ctx) => {
  const chatId = ctx.chat.id;
  const files = await getTrackFiles();

  if (files.length === 0) {
    return ctx.reply('Нет загруженных треков.');
  }

  const offset = 0;
  const limit = 10;
  const slice = files.slice(offset, offset + limit);
  const text = formatFileList(slice, offset + 1);

  paginationState.set(chatId, { offset });

  if (files.length <= limit) {
    return ctx.reply(text);
  }

  const buttons = [];
  if (offset + limit < files.length) {
    buttons.push(Markup.button.callback('Показать ещё 10', 'list_next'));
  }

  return ctx.reply(text, Markup.inlineKeyboard(buttons));
});

// Обработка пагинации
bot.action('list_next', async (ctx) => {
  const chatId = ctx.chat.id;
  const files = await getTrackFiles();
  const state = paginationState.get(chatId) || { offset: 0 };
  const newOffset = state.offset + 10;
  const limit = 10;
  const slice = files.slice(newOffset, newOffset + limit);
  const text = formatFileList(slice, newOffset + 1);

  const buttons = [];
  if (newOffset > 0) {
    buttons.push(Markup.button.callback('Показать предыдущие 10', 'list_prev'));
  }
  if (newOffset + limit < files.length) {
    buttons.push(Markup.button.callback('Показать ещё 10', 'list_next'));
  }

  paginationState.set(chatId, { offset: newOffset });

  await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
  ctx.answerCbQuery();
});

bot.action('list_prev', async (ctx) => {
  const chatId = ctx.chat.id;
  const files = await getTrackFiles();
  const state = paginationState.get(chatId) || { offset: 10 };
  const newOffset = Math.max(0, state.offset - 10);
  const limit = 10;
  const slice = files.slice(newOffset, newOffset + limit);
  const text = formatFileList(slice, newOffset + 1);

  const buttons = [];
  if (newOffset > 0) {
    buttons.push(Markup.button.callback('Показать предыдущие 10', 'list_prev'));
  }
  if (newOffset + limit < files.length) {
    buttons.push(Markup.button.callback('Показать ещё 10', 'list_next'));
  }

  paginationState.set(chatId, { offset: newOffset });

  await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
  ctx.answerCbQuery();
});

// Команда /del N
bot.command('del', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const numStr = args[0];

  if (!numStr || isNaN(numStr)) {
    return ctx.reply('Укажите номер файла: /del N');
  }

  const fileIndex = parseInt(numStr, 10) - 1; // нумерация с 1 → индекс с 0

  if (fileIndex < 0) {
    return ctx.reply('Неверный номер файла.');
  }

  const files = await getTrackFiles();

  if (fileIndex >= files.length) {
    return ctx.reply('Файл с таким номером не найден.');
  }

  const fileName = files[fileIndex];
  const filePath = path.join(TRACKS_DIR, fileName);

  try {
    await fs.unlink(filePath);
    ctx.reply(`${fileName} удалён`);
  } catch (err) {
    console.error('Ошибка при удалении файла:', err);
    ctx.reply('Не удалось удалить файл.');
  }
});

// Запуск бота
bot.launch();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));