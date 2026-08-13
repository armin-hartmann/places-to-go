import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(projectRoot, 'dist', 'pb_public');
const htmlFiles = ['index.html', 'admin.html'];
const cacheBustedAssets = [
  'styles.css',
  'config.js',
  'data.js',
  'app.js',
  'admin.js',
  'vendor/pocketbase.umd.js'
];
const publicFiles = [
  ...htmlFiles,
  'favicon.svg',
  'apple-touch-icon.png',
  ...cacheBustedAssets.filter(asset => !asset.startsWith('vendor/'))
];

function assetPath(asset) {
  return asset === 'vendor/pocketbase.umd.js'
    ? join(projectRoot, 'node_modules', 'pocketbase', 'dist', 'pocketbase.umd.js')
    : join(projectRoot, asset);
}

function cacheVersion(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

const assetVersions = new Map(await Promise.all(cacheBustedAssets.map(async asset => {
  const content = await readFile(assetPath(asset));
  return [asset, cacheVersion(content)];
})));

function addCacheVersions(html) {
  return html.replace(/(href|src)="(styles\.css|config\.js|data\.js|app\.js|admin\.js|vendor\/pocketbase\.umd\.js)(?:\?v=[^"]*)?"/g,
    (match, attribute, asset) => `${attribute}="${asset}?v=${assetVersions.get(asset)}"`
  );
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, 'vendor'), { recursive: true });

await Promise.all(publicFiles
  .filter(file => !htmlFiles.includes(file))
  .map(file => copyFile(join(projectRoot, file), join(outputRoot, file)))
);

await Promise.all(htmlFiles.map(async file => {
  const html = await readFile(join(projectRoot, file), 'utf8');
  await writeFile(join(outputRoot, file), addCacheVersions(html));
}));

await copyFile(
  assetPath('vendor/pocketbase.umd.js'),
  join(outputRoot, 'vendor', 'pocketbase.umd.js')
);

console.log(`Built PocketBase public files in ${outputRoot}`);
