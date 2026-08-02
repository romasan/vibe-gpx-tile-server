# vibe-gpx-tile-server

Сервер для отображения велосипедных GPX-треков на карте OpenStreetMap в виде тайлов. Приложение интегрировано с Telegram (Mini App + бот): пользователь загружает GPX-треки в бота, а затем просматривает их на интерактивной карте.

---

## Содержание

- [Обзор](#обзор)
- [Как это работает](#как-это-работает)
- [Структура проекта](#структура-проекта)
- [Серверная часть](#серверная-часть)
  - [index.js — точка входа](#indexjs--точка-входа)
  - [tiles.js — ядро тайлового рендеринга](#tilesjs--ядро-тайлового-рендеринга)
  - [session.js — управление сессиями](#sessionjs--управление-сессиями)
  - [strava.js — загрузка в Strava](#stravajs--загрузка-в-strava)
  - [utils.js — вспомогательные функции](#utilsjs--вспомогательные-функции)
- [API](#api)
- [Telegram-бот](#telegram-бот)
- [Фронтенд](#фронтенд)
- [Скрипты](#скрипты)
- [Конфигурация](#конфигурация)
- [Установка и запуск](#установка-и-запуск)

---

## Обзор

Приложение решает задачу: **показать пользователю все его велосипедные треки (GPX) на карте** максимально быстро и без тяжёлых клиентских библиотек.

Ключевые идеи:

- **Предварительная обработка на сервере.** При старте сервер читает все GPX-файлы, конвертирует их в GeoJSON и заранее вычисляет, какие тайлы (z/x/y, zoom 0–19) пересекают маршруты. Результат кэшируется в `cache/<id>.json`.
- **Серверный рендеринг тайлов.** Тайлы маршрутов отдаются как готовые PNG-изображения (SVG-полилиния → raster через `sharp`). Клиент просто накладывает PNG поверх подложки.
- **Подложка OSM с кэшированием.** Оригинальные тайлы OpenStreetMap проксируются через сервер и кэшируются в `cache/osm-*.png`, что ускоряет повторные запросы.
- **Интеграция с Telegram.** Фронтенд работает как Telegram Mini App: токен сессии привязывается к пользователю Telegram через проверку `initData`. Пользователи не проходят отдельную регистрацию.
- **Простое хранение треков.** GPX-файлы лежат в папках `gpx-files/<telegram-user-id>/`, по одному пользователю на папку. Идентификатор пользователя Telegram используется как `id`.

---

## Как это работает

```
┌────────────┐   документ .gpx  ┌─────────────┐   сохранение   ┌────────────────────┐
│ Telegram   │ ───────────────► │  Telegram   │ ─────────────► │ gpx-files/<userId>/│
│   бот      │                  │    бот      │                └────────────────────┘
└────────────┘                  └─────────────┘
                                     │
┌─────────────┐   opens Mini App     ▼                       при старте сервера
│ Пользователь│ ─────────────────► ┌─────────────────────────────────────────────┐
│ (Telegram)  │   /start (initData)│            Сервер (Node.js / Express)       │
└─────────────┘                    │                                             │
        │                          │  1. Читает GPX-файлы пользователя           │
        │                          │  2. Конвертирует в GeoJSON                  │
        │                          │  3. Считает пересечения маршрутов с тайлами │
        │                          │  4. Кэширует в cache/<id>.json              │
        │                          └─────────────────────────────────────────────┘
        │                                      │
        │   запросы тайлов                     │ отдаёт PNG и JSON
        │   /osm/:z/:x/:y.png                  │
        │   /tile/:z/:x/:y.png                 ▼
        │                         ┌─────────────────────────────┐
        └───────────────────────► │  Мини-приложение (Canvas):  │
                                  │  слой OSM + слой GPX-треков │
                                  └─────────────────────────────┘
```

1. Пользователь отправляет GPX-файл боту. Бот сохраняет его в `gpx-files/<userId>/`.
2. При старте сервера (или после загрузки/удаления файлов) `tiles.js` строит кэш: для каждого пользователя конвертирует все треки в GeoJSON и вычисляет `tileFeatureMap` — соответствие «тайл → индексы фич».
3. Фронтенд (Telegram Mini App) отправляет POST `/start` с `initData` из Telegram. Сервер проверяет подпись, создаёт сессию и выдаёт центр/зум карты (а также флаг `showDebug` для отладки).
4. Карта рендерится на двух наложенных слоях canvas:
   - нижний — тайлы OpenStreetMap (`/osm/:z/:x/:y.png`);
   - верхний — тайлы с маршрутами (`/tile/:z/:x/:y.png`).
   Тайл маршрута рендерится только если через него проходит хотя бы один трек (иначе `204 No Content`).
5. Смена карты интуитивная: перетаскивание мышью/пальцем, зум колесом или pinch-to-zoom (с плавным дробным зумом).

---

## Структура проекта

```
gpx-tile-server/
├── index.js                 # Точка входа: Express-сервер и маршруты
├── session.js               # In-memory хранилище сессий по токенам
├── tiles.js                 # Ядро: парсинг GPX, кэш пересечений, рендер тайлов
├── strava.js                # Класс-загрузчик треков в Strava API (через SOCKS5-прокси)
├── utils.js                 # simpleHash и утилиты
├── config.json              # Конфигурация (в .gitignore, не хранится в git)
├── package.json
│
├── api/                     # Обработчики HTTP-эндпоинтов
│   ├── admin.js             # GET /admin — страница админки
│   ├── init.js              # POST /start — авторизация и создание сессии
│   ├── list.js              # GET /admin/list — список GPX-файлов
│   ├── osm.js               # GET /osm/:z/:x/:y.png — прокси-тайлы OSM
│   ├── remove.js            # DELETE /admin/remove-gpx/:fileName
│   ├── tile.js              # GET /tile/:z/:x/:y.png — тайлы маршрутов
│   └── upload.js            # POST /admin/upload — загрузка GPX-файлов
│
├── bot/
│   └── index.js             # Telegram-бот: приём GPX, кнопка Mini App, выгрузка в Strava
│
├── static/                  # Клиентское приложение (Telegram Mini App)
│   ├── index.html           # Разметка: два canvas и Telegram WebApp SDK
│   ├── index.js             # Инициализация: авторизация /start, геолокация, карта
│   ├── map.js               # Класс MapRenderer — движок карты на Canvas
│   ├── utils.js             # debounce, throttle, getRandomHexColor
│   ├── style.css            # Стили карты
│   └── admin.html           # Админ-панель: загрузка/удаление GPX
│
├── scripts/                 # Утилиты для подготовки треков
│   ├── prepare.sh           # Конвейер: unpack_gz → fit→gpx → чистка
│   ├── unpack_gz.sh         # Рекурсивная распаковка .gz
│   ├── convertFitToGpx.js   # Конвертация .fit в .gpx
│   ├── deleteNonCyclingGPX.js # Удаление треков с типом "walking"
│   ├── generatePreviews.js  # Генерация JPG-превью треков
│   └── diffdir.sh           # Сравнение двух директорий по именам файлов
│
├── gpx-files/               # GPX-треки: gpx-files/<userId>/*.gpx (в .gitignore)
├── cache/                   # Кэш: <id>.json и тайлы *.png (в .gitignore)
├── uploads/                 # Временная папка multer для загрузок (в .gitignore)
└── previews/                # Сгенерированные превью (в .gitignore)
```

---

## Серверная часть

### index.js — точка входа

Запускает Express-сервер на порту из `config.json` (`webserver.port`, по умолчанию 8080).

Подключает middleware:

- `cookieParser` — чтение cookie `token`;
- `express.urlencoded` — разбор формы с `initData` Telegram;
- `express.static` — раздача `static/`.

Маршруты:

| Метод | Путь                        | Обработчик | Описание |
|-------|-----------------------------|------------|----------|
| GET   | `/osm/:z/:x/:y.png`         | `api/osm`  | Тайлы подложки OpenStreetMap (с кэшем) |
| GET   | `/tile/:z/:x/:y.png`        | `api/tile` | Тайлы с маршрутами |
| POST  | `/start`                    | `api/init` | Авторизация Mini App, создание сессии |
| POST  | `/admin/upload`             | `api/upload` | Загрузка GPX-файлов (multer) |
| GET   | `/admin/list`               | `api/list` | Список GPX-файлов |
| DELETE| `/admin/remove-gpx/:fileName`| `api/remove` | Удаление GPX-файла |
| GET   | `/admin`                    | `api/admin` | Админ-панель |

Telegram-бот подключается закомментированным фрагментом (включается при наличии `telegram.token`).

### tiles.js — ядро тайлового рендеринга

Самый важный модуль. При загрузке вызывает `initializeCache()`, который строит кэш для **всех** пользователей из `gpx-files/`.

Алгоритм `initializeCachePerUser(id)`:

1. **hasCache(id)** — проверяет, есть ли файл `cache/<id>.json` и совпадает ли его `key` с актуальной контрольной суммой списка файлов (`simpleHash` от имён GPX-файлов). Если файлы не менялись — кэш переиспользуется.
2. **loadGPXFiles(id)** — читает все `.gpx` из `gpx-files/<id>/`, парсит через `@mapbox/togeojson` + `xmldom`, удаляет `coordTimes`, склеивает в единый GeoJSON `FeatureCollection`.
3. **calculateTileIntersections(geojson)** — для каждой точки каждого маршрута (LineString/MultiLineString) для уровней зума **0–19** вычисляет тайл `(z, x, y)` по проекции Web Mercator и собирает `tileFeatureMap: { "z-x-y": [индексы фич] }`. Также вычисляет `mapCenter` (середина bounding box) и `mapZoom` для стартового вида карты.
4. **saveCache(id, payload)** — сохраняет `{ key, geojson, tileFeatureMap, mapCenter, mapZoom }` в `cache/<id>.json`.

Рендеринг тайла — `renderTile(z, x, y, id)`:

- Получает из `cache[id].tileFeatureMap` индексы фич для тайла;
- Конвертирует координаты каждой фичи в пиксели тайла (256×256) согласно проекции Меркатора;
- Собирает SVG с `<polyline>` (синий цвет);
- Отрисовывает через `sharp` (прозрачный фон + наложение SVG) и возвращает PNG-буфер.

Дополнительно:

- `getTilePath(z, x, y, id)` — путь к PNG-файлу `cache/gpx-<id>-<z>-<x>-<y>.png`;
- `clearTileCache()` — удаляет все файлы `gpx-*` из `cache/`;
- `getMapInfo(id)`, `getTileFeatureMap(id)`, `prefetchCache(id)` — для API-слоя.

### session.js — управление сессиями

Простое in-memory хранилище `sessions[token] = payload`:

- `getSession(token)` — вернуть сессию;
- `addSession(token, payload)` — сохранить сессию.

Сессии не переживают перезапуск сервера (запись в файл закомментирована).

### strava.js — загрузка в Strava

Класс `StravaUploader` для загрузки GPX-файлов в Strava через официальное API v3.

Возможности:

- `uploadGPX(filePath, options)` — загрузка файла (multipart/form-data) с параметрами: название, описание, `activity_type`, `private`, `commute`. Лимит размера — 25 МБ.
- `checkUploadStatus(uploadId, maxAttempts, interval)` — опрос статуса загрузки (до 30 попыток с паузой 2 с) до готовности активности.
- `uploadAndTrack(filePath, options)` — загрузка + ожидание готовности.

Работает через **SOCKS5-прокси** (`proxy.host` из конфига) — используется `socks-proxy-agent`. Готовая функция `upload(filePath, secret)` — вспомогательная для ручного тестирования (использует `debugStravaSecret`).

### utils.js — вспомогательные функции

- `simpleHash(str)` — 32-битный хеш строки (для контрольной суммы списка файлов в кэше);
- `createFullGPXContent(locations, fileName)` — генератор GPX-содержимого по массиву точек (используется в legacy-коде).

---

## API

| Эндпоинт | Метод | Параметры | Описание |
|----------|-------|-----------|----------|
| `/start` | POST | body: `initData` Telegram | Проверка подписи `initData` (HMAC-SHA256 от `WebAppData` и токена бота), создание сессии и cookie `token`, `prefetchCache`, возврат `{ center, zoom, showDebug? }`. При отладочном режиме или `debugUserId` возвращает `showDebug: true`. Поддерживает `debugMode` и fallback на `debugUserId`. |
| `/osm/:z/:x/:y.png` | GET | z, x, y | Прокси-тайлы OSM. Если `cache/osm-<z>-<x>-<y>.png` существует — отдаёт его, иначе скачивает с `tile.openstreetmap.org`, пишет в кэш и отдаёт. `Cache-Control: max-age=600`. |
| `/tile/:z/:x/:y.png` | GET | z, x, y | Тайлы маршрутов. Определяет пользователя по cookie `token` → сессия → `id` (либо `debugUserId`). Если для тайла нет фич — `204`. Если PNG в кэше — отдаёт, иначе рендерит `renderTile`. |
| `/admin/upload` | POST | multipart: `gpxFiles[]` | Загружает файлы в `gpx-files/`, затем `clearTileCache()` + `initializeCache()`. |
| `/admin/list` | GET | — | JSON-массив имён GPX-файлов из `gpx-files/` (корень). |
| `/admin/remove-gpx/:fileName` | DELETE | fileName | Удаляет файл, очищает и пересобирает кэш. |
| `/admin` | GET | — | Страница `admin.html`. |

Примечание: в обработчике `remove.js` используется необъявленная переменная `gpxDir` (баг — путь строится от неё). На практике маршрут работает только с переменной-глобальной из контекста либо требует исправления на `path.join(__dirname, '../gpx-files')`.

---

## Telegram-бот

Модуль `bot/index.js` (сейчас подключение в `index.js` закомментировано).

Функции:

- `/start` — приветственное сообщение с inline-кнопкой **«🗺️ Показать карту»**, открывающей Web App (`telegram.webapp` из конфига).
- Приём документов — если пользователь отправил файл с расширением `.gpx`:
  1. Скачивает файл через `getFileLink`;
  2. Сохраняет в `gpx-files/<telegramUserId>/<fileName>`;
  3. Если `telegramUserId === debugIDForStrava` — дополнительно загружает трек в **Strava** (`upload()` из `strava.js`) и сообщает о результате.

TODO в коде: обновление кэша карты после загрузки (`initializeCachePerUser`) и очистка старых кэшированных тайлов пользователя.

Бот запускается через `Telegraf` с **SOCKS5-прокси** из `proxy.host`.

---

## Фронтенд

Клиент — Telegram Mini App без фреймворков: vanilla JS + Canvas 2D.

### index.html

- Два абсолютно спозиционированных canvas: `#osm-canvas` (подложка) и `#gpx-canvas` (маршруты);
- подключает `telegram-web-app.js` и модуль `/index.js`.

### index.js — инициализация

1. Получает `window.Telegram.WebApp`;
2. POST `/start` с `initData` (устанавливает cookie сессии `credentials: 'include'`);
3. Разворачивает Mini App (`tg.expand()`);
4. Создаёт `MapRenderer(data)` с центром и зумом от сервера;
5. Запрашивает геолокацию браузера и позиционирует карту на пользователе (центр + маркер).

### map.js — класс MapRenderer

Движок карты (~580 строк):

- **Два слоя тайлов.** `renderTiles(ctx, route)` вычисляет видимые тайлы на экране для целочисленного зума, запрашивает по маршруту `/osm/...` или `/tile/...`, кэширует в `Map` (включая «пустые» тайлы с `204`), отменяет лишние запросы через `AbortController` (`breakFetch`).
- **Дробный зум (zoomFloat).** Canvas масштабирует тайлы плавно между целыми уровнями зума (`scale = 1 + zoomFloat % 1`).
- **Проекция Web Mercator.** `latLngToPixel` / `pixelToLatLng` (+ `screenToLatLng` с учётом дробного зума).
- **Управление:** drag мышью/пальцем, колесо мыши, pinch-to-zoom на мобильных. Долгий тап (TODO) — открытие меню.
- **Маркеры:** `addMarker(lat, lng, options)` с отрисовкой и проверкой видимости `isPointVisible`.
- **Debug-режим:** `showDebug` рисует рамки тайлов, центр карты и отладочную панель (зум, координаты, размеры кэша).
- Оптимизации: `debounce` при ресайзе и после загрузки изображений, `throttle` для колеса.

### admin.html

Мини-админка: форма загрузки GPX-файлов (`/admin/upload`), список файлов (`/admin/list`), кнопка удаления (`/admin/remove-gpx/:fileName`).

### api/init.js — авторизация Telegram

Проверка `initData`:

```
secret = HMAC_SHA256(key="WebAppData", token бота)
data_check_string = отсортированные по алфавиту ключи (кроме hash) в виде key=value, разделённые \n
hash = HMAC_SHA256(secret, data_check_string)
→ сравнивается с query.hash
```

При успехе из `params.user` достаётся объект пользователя Telegram (JSON), и сессия создаётся с `id` = Telegram User ID. Далее `getMapInfo(user.id)` отдаёт центр/зум, а `showDebug` добавляется если `debugMode` или пользователь = `debugUserId`.

---

## Скрипты

| Скрипт | Назначение |
|--------|------------|
| `prepare.sh <dir>` | Полный конвейер подготовки треков: распаковка `.gz` → конвертация `.fit` → удаление не-велосипедных треков. |
| `unpack_gz.sh <dir>` | Рекурсивная распаковка всех `.gz` файлов (gunzip, оригинал удаляется). |
| `convertFitToGpx.js <dir>` | Рекурсивно конвертирует `.fit` в `.gpx` через `fit-file-parser` (записи с координатами → trkpts с `ele`/`time`), потом удаляет `.fit`. |
| `deleteNonCyclingGPX.js <dir>` | Удаляет GPX-файлы, у которых `<type>` = `walking` (проверяет namespace GPX 1.1, fallback — без namespace). |
| `generatePreviews.js <path>` | Генерирует JPG-превью треков: скачивает OSM-тайлы (с кэшем), склеивает в картинку, накладывает полилинию и ресайзит до 1000px. Результат — в `previews/`. |
| `diffdir.sh <a> <b>` | Сравнивает две директории по базовым именам файлов (без расширений), выводит файлы, присутствующие только в одной из них. |

---

## Конфигурация

Файл `config.json` отсутствует в git (`*.json` в `.gitignore`). Примерная структура:

```json
{
  "webserver": {
    "port": 8080
  },
  "telegram": {
    "token": "BOT_TOKEN",
    "webapp": "https://t.me/your_bot/app",
    "debugUserId": 123456789,
    "debugIDForStrava": 123456789
  },
  "proxy": {
    "host": "socks5://127.0.0.1:1080"
  },
  "debugStravaSecret": "STRAVA_ACCESS_TOKEN",
  "debugMode": false
}
```

| Поле | Назначение |
|------|------------|
| `webserver.port` | Порт HTTP-сервера |
| `telegram.token` | Токен Telegram-бота (для WebApp-авторизации и бота) |
| `telegram.webapp` | URL Mini App для кнопки в боте |
| `telegram.debugUserId` | Отладочный пользователь: для него доступны отладочные данные и fallback при отсутствии авторизации |
| `telegram.debugIDForStrava` | Пользователь, чьи треки автоматически загружаются в Strava |
| `proxy.host` | SOCKS5-прокси для Telegram-бота и Strava API |
| `debugStravaSecret` | Access-токен Strava для ручной загрузки |
| `debugMode` | Глобальный режим отладки (`showDebug` для всех) |

---

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Создать config.json по образцу выше

# Подготовка треков (опционально): распаковка + fit→gpx + чистка
npm run prepare -- gpx-files

# Генерация превью (опционально)
npm run generatePreviews -- gpx-files

# Запуск в dev-режиме
npm run dev

# Запуск под pm2 (production)
npm start
```

После запуска:

- Мини-приложение: `http://localhost:8080/`
- Админка: `http://localhost:8080/admin`
- Тайлы: `/osm/:z/:x/:y.png` и `/tile/:z/:x/:y.png`

---

## Примечания и известные ограничения

- **Сессии в памяти** — при перезапуске сервера пользователи должны заново открыть Mini App (cookie устареет).
- **Кэш пересобирается при старте** — при большом количестве треков первый запуск может занять время (для наглядности выводится прогресс-бар и время инициализации).
- **`api/remove.js` использует необъявленную переменную `gpxDir`** — при тестировании удаления файлов потребуется исправление.
- **Кэш тайлов после загрузки через бота** — обновление карты после поступления нового трека через бота помечено как TODO: `initializeCachePerUser` закомментирован.
- **Загрузка в Strava** — активна только для пользователя с `debugIDForStrava`, работает через SOCKS5-прокси.
- **`cookie` без `expires`/`httpOnly`** — сессионная cookie, хранится в памяти браузера.