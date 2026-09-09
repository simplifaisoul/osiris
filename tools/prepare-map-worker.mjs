import { copyFile, mkdir, readFile } from 'node:fs/promises';

// MapLibre 6's module worker imports a sibling shared module. Self-host both
// from the installed version, rather than relying on a CDN or bundler-relative URL.
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/maplibre-gl/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
const target = new URL(`public/vendor/maplibre/${version}/`, root);
await mkdir(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', '../LICENSE.txt']) {
  await copyFile(new URL(`dist/${file}`, source), new URL(file.split('/').at(-1), target));
}
