import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(projectRoot, 'dist', 'pb_public');
const publicFiles = [
  'index.html',
  'admin.html',
  'favicon.svg',
  'apple-touch-icon.png',
  'styles.css',
  'config.js',
  'data.js',
  'app.js',
  'admin.js'
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, 'vendor'), { recursive: true });

await Promise.all(publicFiles.map(file => (
  copyFile(join(projectRoot, file), join(outputRoot, file))
)));

await copyFile(
  join(projectRoot, 'node_modules', 'pocketbase', 'dist', 'pocketbase.umd.js'),
  join(outputRoot, 'vendor', 'pocketbase.umd.js')
);

console.log(`Built PocketBase public files in ${outputRoot}`);
