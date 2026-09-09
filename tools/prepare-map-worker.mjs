import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';

// MapLibre 6's module worker imports a sibling shared module. Self-host both
// from the installed version, rather than relying on a CDN or bundler-relative URL.
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/maplibre-gl/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
const vendor = new URL('public/vendor/maplibre/', root);
const target = new URL(`${version}/`, vendor);
await mkdir(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', '../LICENSE.txt']) {
  await copyFile(new URL(`dist/${file}`, source), new URL(file.split('/').at(-1), target));
}

/* These files are committed, because the map hard-fails without them and a
   build that skips npm lifecycle scripts would otherwise ship none. Committing
   them means a stale directory survives a version bump, and a developer keeping
   the old copy is exactly how a broken worker URL passes locally and 404s in
   production. Prune everything but the installed version so the tree can only
   ever hold what the bundle actually asks for. */
for (const entry of await readdir(vendor, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== version) {
    await rm(new URL(`${entry.name}/`, vendor), { recursive: true, force: true });
    console.log(`prepare-map-worker: pruned stale maplibre ${entry.name}`);
  }
}
