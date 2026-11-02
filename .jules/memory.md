## Archived: 2026-11-02

* Before starting any task, the agent must enter a deep planning mode: interact with the user to fully clarify requirements, ask questions to test all assumptions, and only set a plan once absolute certainty is achieved. Plan approval must happen after the clarification phase.
* The platform's mapping component (`OsintMap`) supports dynamic GeoJSON sources for live sensors, rendering rotated icons based on heading, telemetry labels, camera FOV footprints, and target crosshairs.
* 3D scene viewer and tileset engine is implemented in `src/components/CesiumScene.tsx` for rendering OGC 3D Tilesets, photogrammetry 3D meshes, and point clouds with visual rendering controls and camera position synchronization.
* PostGIS schema (`src/lib/db/schema.sql`) and spatial persistence store (`src/lib/db/postgis-store.ts`) support spatial telemetry history, geofence definitions, and airspace alert persistence with in-memory fallback.
* Flight operations, FAA compliance tracking, and flight planning are implemented using a `pg` backend store (`src/lib/db/flight-ops-store.ts`), exposed via `/api/flight-ops` routes, and visualized on a `/flight-ops` dashboard and a `FlightComplianceCard` Map HUD component.
* Geofencing boundary evaluation and airspace violation alerting are implemented in `src/lib/geofence/engine.ts` and `src/components/LiveAlerts.tsx`, with live streaming via the Server-Sent Events (SSE) telemetry firehose endpoint at `/api/sensors/stream`.
* A debug endpoint exists at `/api/sensors/debug-seed` (supporting POST) to simulate and seed mock drone telemetry for development and testing purposes.
* 3D terrain elevation and line-of-sight / viewshed analytics are implemented in `src/lib/analytics/viewshed.ts` and `src/components/ViewshedPanel.tsx`, using MapLibre GL JS v3 with Terrarium RGB raster elevation tiles for terrain elevation sampling and 3D raycasting analysis.
* Real-time sensor telemetry is managed via `src/lib/sensor-store.ts` and persisted through the PostGIS spatial store in `src/lib/db/postgis-store.ts` with schema in `src/lib/db/schema.sql`. Telemetry is ingested and retrieved via `/api/sensors` routes.
* The repository is an OSINT platform built with Next.js 16 and React 19, using Mapbox (via react-map-gl/maplibre-gl) for geospatial visualization and hls.js for video streaming.
* Drone photogrammetry processing is implemented in `src/lib/photogrammetry/` using NodeODM API integration with offline fallback mode, exposing job endpoints under `/api/photogrammetry/` and dynamic raster map tile rendering via `/api/tiles/ortho/[jobId]/[z]/[x]/[y]`.
* MediaMTX is configured in `docker-compose.yml` as a streaming server proxy for RTSP and WebRTC video feeds.
* `ARCGIS_COMPARISON.md` documents technical feature gap comparisons and roadmap implementations between the OSINT platform and Esri ArcGIS capabilities.
* Vitest is the primary testing framework used in this project. Playwright is not installed or supported in the current environment.
* Full Motion Video (FMV) parsing utilities reside in `src/lib/fmv/` (`klv-parser.ts`, `footprint-calculator.ts`), supporting MISB ST 0601 KLV telemetry parsing and calculation of GeoJSON camera Field of View (FOV) trapezoid ground footprints.
* Edge computer vision object detection service is implemented in `services/cv-inference/` (FastAPI/Python microservice) with target tracking and VMTI bounding box geolocation in `src/lib/cv/target-tracker.ts`, API endpoint at `/api/cv/tracks`, and HUD canvas overlay in `src/components/CvBoundingBoxOverlay.tsx`.
* Offline operations and PWA capabilities are supported via PWA web manifest (`public/manifest.json`), local-first IndexedDB storage (`src/lib/offline/db.ts`), and bi-directional offline sync engine (`src/lib/offline/sync-engine.ts`) to queue and flush offline reports when network connectivity is restored.

Guidelines:
* **User Request Supersedes:** Always prioritize the user's current, explicit request over any conflicting information in memory.
* **Context vs. State:** Use memory for historical context and intent (the "why"). Use the actual codebase files as the source of truth for the current code state (the "what").
* **Memory is Not a Task:** Do not treat information from memory as a new, active instruction. Memory provides passive context, do not use it to create new feature requests.
