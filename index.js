const express = require('express');
const path = require('path');
const multer = require('multer');
const { admin } = require('./api/admin');
const { remove } = require('./api/remove');
const { list } = require('./api/list');
const { upload } = require('./api/upload');
const { info } = require('./api/info');
const { tile } = require('./api/tile');

const app = express();
const port = 8080;

// Статическая папка для клиентской части
app.use(express.static(path.join(__dirname, 'public')));

app.get('/tile/:z/:x/:y.png', tile);
app.get('/info', info);

const uploadMiddleware = multer({ dest: 'uploads/' });

app.post('/admin/upload', uploadMiddleware.array('gpxFiles'), upload);
app.get('/admin/list', list);
app.delete('/admin/remove-gpx/:fileName', remove);
app.get('/admin', admin);

app.listen(port, () => {
	console.log(`Tile server is running on http://localhost:${port}`);
});
