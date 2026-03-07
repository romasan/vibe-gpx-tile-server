const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const { admin } = require('./api/admin');
const { remove } = require('./api/remove');
const { list } = require('./api/list');
const { upload } = require('./api/upload');
const { init } = require('./api/init');
const { tile } = require('./api/tile');
const { osm } = require('./api/osm');

const app = express();
const port = 8080;

app.use(cookieParser());
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'static')));

app.get('/osm/:z/:x/:y.png', osm);
app.get('/tile/:z/:x/:y.png', tile);
app.post('/start', init);

const uploadMiddleware = multer({ dest: 'uploads/' });

app.post('/admin/upload', uploadMiddleware.array('gpxFiles'), upload);
app.get('/admin/list', list);
app.delete('/admin/remove-gpx/:fileName', remove);
app.get('/admin', admin);

app.listen(port, () => {
	console.log(`Tile server is running on http://localhost:${port}`);
});
