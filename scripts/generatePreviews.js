const fs = require('fs');
const path = require('path');
const toGeoJSON = require('@mapbox/togeojson');
const { DOMParser } = require('xmldom');
const sharp = require('sharp');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config.json');
const cliProgress = require('cli-progress');

// --- Configuration ---
const tileSize = 256;
const maxPreviewSize = 1000;
const paddingTiles = 1; // Additional surrounding tiles for padding
const trackStrokeColor = 'blue';
const trackStrokeWidth = 3;
const trackStrokeWidthPixels = 4;

const osmTileCacheDir = path.join(__dirname, '..', 'cache');

// Ensure cache directories exist
if (!fs.existsSync(osmTileCacheDir)) {
  fs.mkdirSync(osmTileCacheDir, { recursive: true });
}

// --- Helper Functions ---

/**
 * Convert lat/lon to tile coordinates
 */
function latLonToTile(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y };
}

/**
 * Get OSM tile path
 */
function getOsmtilePath(z, x, y) {
  return path.join(osmTileCacheDir, `osm-${z}-${x}-${y}.png`);
}

/**
 * Download or retrieve cached OSM tile
 */
async function getOsmtile(z, x, y) {
  const tilePath = getOsmtilePath(z, x, y);

  if (fs.existsSync(tilePath)) {
    return fs.readFileSync(tilePath);
  }

  try {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    console.log('Fetching tile:', url);
    
    let fetchOptions = {
      headers: {
        'User-Agent': 'GPX-Preview-Generator/1.0'
      }
    };
    
    // Use proxy if configured
    if (config.proxy && config.proxy.host) {
      console.log('Using proxy:', config.proxy.host);
      fetchOptions.agent = () => new SocksProxyAgent(config.proxy.host);
    }
    
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      console.error(`Failed to fetch tile ${z}/${x}/${y}: ${response.status}`);
      // Return a blank tile
      return Buffer.from(
        await sharp({
          create: {
            width: tileSize,
            height: tileSize,
            channels: 4,
            background: { r: 210, g: 230, b: 250, alpha: 1 },
          },
        })
          .png()
          .toBuffer()
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tilePath, buffer);
    return buffer;
  } catch (err) {
    console.error(`Error fetching tile ${z}/${x}/${y}:`, err.message);
    return Buffer.from(
      await sharp({
        create: {
          width: tileSize,
          height: tileSize,
          channels: 4,
          background: { r: 210, g: 230, b: 250, alpha: 1 },
        },
      })
        .png()
        .toBuffer()
    );
  }
}

/**
 * Find all GPX files recursively
 */
function findGPXFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findGPXFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gpx')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Load GPX file and extract track coordinates as GeoJSON LineString
 */
function loadGPX(filePath) {
  const gpxData = fs.readFileSync(filePath, 'utf8');
  const gpxDoc = new DOMParser().parseFromString(gpxData);
  const geojson = toGeoJSON.gpx(gpxDoc);

  // Extract all track segments as a single LineString
  const coordinates = [];
  for (const feature of geojson.features) {
    if (!feature.geometry || !feature.geometry.coordinates) {
      continue;
    }

    if (feature.geometry.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiLineString') {
      // MultiLineString is an array of LineStrings
      for (const lineString of feature.geometry.coordinates) {
        coordinates.push(...lineString);
      }
    }
  }

  if (coordinates.length === 0) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

/**
 * Generate preview image for a GPX file
 */
async function generatePreview(gpxPath, outputDir) {
  const gpxData = loadGPX(gpxPath);

  if (!gpxData) {
    console.log(`  [SKIP] No track data in ${path.basename(gpxPath)}`);
    return null;
  }

  const coords = gpxData.geometry.coordinates;

  // Calculate bounding box
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLon = Infinity,
    maxLon = -Infinity;

  for (const [lon, lat] of coords) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  const latDiff = maxLat - minLat;
  const lonDiff = maxLon - minLon;
  const maxDiff = Math.max(latDiff, lonDiff);

  // Determine optimal zoom level
  // At zoom 0, the world is 1 tile. Each zoom level divides tiles by 2.
  // We want the bounding box to fit nicely in the preview
  const worldSize = 40030000; // Earth circumference in meters (approx)
  const boundingBoxSize = Math.sqrt(latDiff * lonDiff) * 111320; // rough meters
  let zoom = 18;
  for (let z = 18; z >= 1; z--) {
    const tilesAcross = Math.pow(2, z);
    const metersPerTile = worldSize / tilesAcross;
    const tilesNeeded = boundingBoxSize / metersPerTile;
    if (tilesNeeded <= 6) {
      zoom = z;
      break;
    }
  }

  // Ensure we have enough detail
  zoom = Math.max(zoom, 10);
  zoom = Math.min(zoom, 18);

  // Calculate tile range
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const centerTile = latLonToTile(centerLat, centerLon, zoom);

  // Calculate the tile coordinates of the bounding box corners
  const topLeft = latLonToTile(maxLat, minLon, zoom);
  const bottomRight = latLonToTile(minLat, maxLon, zoom);

  const minTileX = Math.max(0, topLeft.x - paddingTiles);
  const minTileY = Math.max(0, topLeft.y - paddingTiles);
  const maxTileX = Math.min(Math.pow(2, zoom) - 1, bottomRight.x + paddingTiles);
  const maxTileY = Math.min(Math.pow(2, zoom) - 1, bottomRight.y + paddingTiles);

  const tileCount = (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1);

  console.log(
    `  Zoom: ${zoom}, Tiles: ${minTileX}-${maxTileX}, ${minTileY}-${maxTileY} (${tileCount} tiles)`
  );

  // Download all required tiles
  console.log(`  Downloading tiles...`);
  const bar = new cliProgress.SingleBar(
    { format: 'Progress | {bar} | {percentage}% | {value}/{total}' },
    cliProgress.Presets.shades_classic
  );
  bar.start(tileCount, 0);

  const tiles = [];
  let downloaded = 0;

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const tileBuffer = await getOsmtile(zoom, tx, ty);
      tiles.push({
        x: tx - minTileX,
        y: ty - minTileY,
        buffer: tileBuffer,
      });
      downloaded++;
      bar.update(downloaded);
    }
  }
  bar.stop();

  // Calculate total image size in pixels
  const imgWidth = (maxTileX - minTileX + 1) * tileSize;
  const imgHeight = (maxTileY - minTileY + 1) * tileSize;

  // Composite tiles into a single image
  console.log(`  Compositing tiles...`);
  let baseImage = sharp({
    create: {
      width: imgWidth,
      height: imgHeight,
      channels: 4,
      background: { r: 210, g: 230, b: 250, alpha: 1 },
    },
  });

  const tileInputs = tiles.map((t) => ({
    input: t.buffer,
    left: t.x * tileSize,
    top: t.y * tileSize,
  }));

  const compositeImage = await baseImage
    .composite(tileInputs)
    .png()
    .toBuffer();

  // Calculate scale to fit in maxPreviewSize
  const scale = maxPreviewSize / Math.max(imgWidth, imgHeight);
  const previewWidth = Math.round(imgWidth * scale);
  const previewHeight = Math.round(imgHeight * scale);

  console.log(`  Scaling to ${previewWidth}x${previewHeight}...`);

  // First resize the composite image to preview size
  const resizedImage = await sharp(compositeImage)
    .resize(previewWidth, previewHeight, {
      fit: 'contain',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  // Create SVG for track overlay at preview size
  const scaledStrokeWidth = trackStrokeWidthPixels * scale;
  const svgPoints = coords
    .map(([lon, lat]) => {
      // More accurate pixel calculation
      const worldX = ((lon + 180) / 360) * Math.pow(2, zoom) * tileSize;
      const latRad = (lat * Math.PI) / 180;
      const worldY =
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        Math.pow(2, zoom) *
        tileSize;

      const localX = (worldX - minTileX * tileSize) * scale;
      const localY = (worldY - minTileY * tileSize) * scale;

      return `${localX},${localY}`;
    })
    .join(' ');

  const svgTrack = `<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}">
    <polyline points="${svgPoints}" stroke="${trackStrokeColor}" stroke-width="${scaledStrokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;

  // Composite track over the resized image
  console.log(`  Compositing track...`);
  const finalImage = await sharp(resizedImage)
    .composite([{ input: Buffer.from(svgTrack), blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer();

  // Write output file
  const gpxName = path.basename(gpxPath, '.gpx');
  const outputPath = path.join(outputDir, `${gpxName}.jpg`);

  fs.writeFileSync(outputPath, finalImage);
  console.log(`  Saved: ${outputPath}`);

  return outputPath;
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Please specify a path to GPX files folder or a GPX file.');
    console.error('Usage: node scripts/generatePreviews.js <path>');
    console.error('Example: node scripts/generatePreviews.js gpx-files/');
    process.exit(1);
  }

  const inputPath = args[0];
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  // Determine output directory (previews next to the input directory)
  const inputIsFile = fs.statSync(resolvedPath).isFile();
  const gpxFiles = inputIsFile ? [resolvedPath] : findGPXFiles(resolvedPath);

  if (gpxFiles.length === 0) {
    console.error('No GPX files found.');
    process.exit(1);
  }

  console.log(`Found ${gpxFiles.length} GPX file(s).`);

  // Create previews directory
  // For "gpx-files/83778567/" -> "previews/83778567/"
  // For "gpx-files/" -> "previews/"
  const inputDirName = path.basename(path.resolve(inputPath));
  const baseOutputDir = path.join('previews', inputDirName === '' ? 'previews' : inputDirName);
  
  if (!fs.existsSync(baseOutputDir)) {
    fs.mkdirSync(baseOutputDir, { recursive: true });
  }

  const progressBar = new cliProgress.Bar(
    { format: 'Generating previews | {bar} | {percentage}% | {value}/{total}' },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(gpxFiles.length, 0);
  let completed = 0;
  let skipped = 0;

  for (const gpxFile of gpxFiles) {
    try {
      // Calculate relative path from the input directory to preserve structure
      let relativePath = path.relative(resolvedPath, gpxFile);
      let outputDir = path.join(baseOutputDir, path.dirname(relativePath));

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await generatePreview(gpxFile, outputDir);
      completed++;
    } catch (err) {
      console.error(`  [ERROR] Failed to process ${path.basename(gpxFile)}:`, err.message);
      skipped++;
    }
    completed++;
    progressBar.update(completed);
  }

  progressBar.stop();

  console.log(`\nDone! Completed: ${completed}, Skipped: ${skipped}`);
  console.log(`Previews saved to: ${baseOutputDir}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});