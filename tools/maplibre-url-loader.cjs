// MapLibre 6 constructs a cross-origin worker URL at runtime. Turbopack
// mistakes `new URL(variable, import.meta.url)` for a build-time asset import.
// Qualifying the same native URL constructor preserves runtime behavior.
module.exports = function maplibreUrlLoader(source) {
  return source.replace(/new URL\(([$\w]+),\s*import\.meta\.url\)/g, 'new globalThis.URL($1,import.meta.url)');
};
