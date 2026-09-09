# Lightweight terrain: local review

Terrain is in **Display**, beside **3D Buildings**, on both desktop and mobile.
Enable **3D Terrain**, then use **Zoom to terrain** to inspect the current area.
Enabling/disabling terrain itself preserves the selected zoom, center, and tilt;
the separate zoom button is optional and is never replayed after a map remount.
The existing bottom view strip still selects globe/flat and map/satellite imagery.

## Runtime limits

- One MapLibre renderer and one canvas; no additional 3D engine.
- No elevation downloads at startup or overview zooms. Activation starts at zoom 10 after 500 ms without camera movement; zooming below 9.5 releases terrain resources.
- The globe transitions to a local projection between zoom 7 and 9, before elevation can activate. Mountains still use actual elevation. This avoids compiling both globe-terrain and local-terrain shader variants. See the [supported projection expression](https://maplibre.org/maplibre-style-spec/projection/).
- Elevation: 256 px Terrarium tiles, maximum source zoom 10, bounded render-tile LOD, real-height exaggeration of 1.
- Two simultaneous elevation requests, 12-second request deadline, shared in-flight work, cancellable requests, and an 8 MiB encoded-tile LRU. Browser HTTP caching is also used. GPU resources are not persisted across page reloads.
- Camera pitch is limited to 60 degrees in every view, so enabling terrain never has to flatten an existing camera. Terrain caps pixel ratio at 1.5 and restores the previous pixel ratio when disabled.
- Buildings reuse the existing CARTO building source and appear from zoom 14.5. Enabling them alone does not download elevation.
- Satellite GPU programs are cached per projection variant; inactive satellite layers compile no programs. Picking and orbit programs are created only when needed.

## Regression checks

```powershell
npm test
npm run build

# Run against an already-running production preview, not the dev server.
$env:PREVIEW_URL='http://127.0.0.1:3001'
$env:SMOKE_SCENARIO='terrain'
node tools/preview-smoke.mjs
```

Other scenarios: `startup`, `zoom`, `terrain-camera`, `mobile`, `recovery`, `imagery`, `buildings`, `satellites`.
`CHROME_PATH` selects a Chromium browser; the default is the installed Windows Chrome.
`PROFILE_TERRAIN=1` captures a CPU profile in the test's temporary output folder.
Each test uses an isolated headless profile, never the user's browser profile.
Imagery/building/camera tests substitute only localhost geolocation responses; the satellite
test substitutes a 200-object localhost feed. Map tiles and elevation remain real.

The automated checks cover rapid zoom taps, source/canvas reuse, terrain gating,
same-area cache reuse, mobile overflow, view switching, and failure/retry behavior.
Screenshots and JSON reports are saved in the temporary profile directory printed by the test.

## Review limits

Latest local validation (2026-09-08): Next.js 16.3.4 production build and TypeScript
checks pass after rebasing onto current master; 603 tests pass, with 14
opt-in/live-network tests skipped. Camera
regressions confirm unchanged zoom, pitch, bearing, and center when terrain is
enabled at zoom 8 and 13, disabled, or enabled from flat mode. Same-area terrain
re-enable reused all elevation data (22 requests before and after), reaching ready
in 930 ms in the final isolated run. This is a one-machine observation, not a
latency guarantee. The initial zoom/scale readout now reflects the loaded camera;
three rapid taps correctly advance 6.5 to 9.5. Theme remounts do not replay an
earlier explicit terrain-zoom request. Mobile layout, real Alpine imagery, and
Edge startup failure/retry checks also pass.

Production dependency hardening updates Next.js / eslint-config-next to 16.3.4
and sharp to 0.35.4, with patched PostCSS, nanoid, and baseline-browser-mapping
in the lockfile.
`npm audit --omit=dev` reports zero known vulnerabilities. The full audit still
reports 8 development-tool findings (3 moderate, 4 high, 1 critical), including
the old Vitest/Vite toolchain. Do not expose its test UI/dev server; upgrading
that toolchain and clearing the repository's lint debt remain separate work.

This is a local release candidate, not a whole-site production certification.
Physical iOS/Safari and low-end Android devices still need hands-on testing.
WebGL2 is required by MapLibre 6. Cold graphics initialization can still produce
a short hitch; headless timing is diagnostic, not a promised frame rate.

The repository has pre-existing lint debt. External data feeds are independently
fallible: CCTV catalog retries preserve successful regions, but cannot make an
offline provider or camera available. Existing provider configuration/rate limits,
and intermittent market-feed CORS failures, are separate from terrain rendering.

The local preview does not deploy or merge changes; release through a reviewed PR.
