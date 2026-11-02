import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      'maplibre-gl.mjs': {
        loaders: [`${__dirname}/tools/maplibre-url-loader.cjs`],
        as: '*.js',
      },
    },
  },
  /* Standalone output exists for the Docker image — the Dockerfile copies
     .next/standalone. Vercel builds its own artifacts and does not want it:
     since the 16.2.6 -> 16.3.4 bump its adapter fails packaging with
     `ENOENT .next/next-server.js.nft.json` in onBuildComplete when a
     Turbopack build also emits standalone. The build itself compiles fine,
     which is why this only ever shows up on a deploy. Keep standalone
     everywhere except Vercel, so Docker and the platform both get what they
     expect. */
  output: process.env.VERCEL ? undefined : 'standalone',
  /* onnxruntime-web runs the camera detector for forecasts, and loads its
     WebAssembly engine from its own folder at run time: bundling it would
     move the code away from the engine, so it stays a package, and the
     standalone build is told to bring the two engine files along. */
  serverExternalPackages: ['ws', 'onnxruntime-web'],
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', './node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'],
  },
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  // Type errors block the build again. They were suppressed while 17 stood
  // unfixed; those are cleared, so the gate can do its job — the AstraPanel
  // crash (createPortal used without an import) shipped precisely because
  // nothing stopped it.
  typescript: {
    ignoreBuildErrors: false,
  },
  // No "X-Powered-By: Next.js": it tells a scanner which advisories to try.
  poweredByHeader: false,
  /* No images.remotePatterns: nothing renders next/image, and the old
     `hostname: '**'` let anyone use /_next/image to fetch and resize pictures
     from any host through this server. A remote image source added later
     should be listed by exact host.
     `unoptimized` goes one step further and switches the optimizer off, so
     /_next/image answers 404 before it fetches or decodes anything. Nothing
     here needs resized images, and the optimizer is where most of Next's
     recent advisories have been. */
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      /* The worker path carries the MapLibre version, so a given URL never
         changes contents — a version bump moves it. Next serves public/ with
         max-age=0, which made every page load refetch half a megabyte before
         the map could start. Immutable is safe here precisely because the
         version is in the path. */
      {
        source: '/vendor/maplibre/:version/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // The camera detector's model: versioned in its path like the map worker, so the same URL never changes.
      {
        source: '/vendor/yolox/:version/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:;" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Other sites learn the origin a visitor came from, not the view they were on.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          /* Location (directions, "near me") and the microphone (OI voice)
             are used by OSIRIS itself and by nothing it embeds; the rest it
             never asks for, so no page or embed can. */
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=(), payment=(), usb=(), display-capture=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
