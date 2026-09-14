import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin the workspace root to this project so Turbopack doesn't infer a parent
  // directory when a stray lockfile exists higher up (e.g. in the user's home).
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Allow SOLO preview host (and localhost) to load Next.js dev resources like HMR.
  // Without this, the app may "not open" in the preview due to blocked cross-origin requests.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    'run-agent-6a1cffe5e98e4b99164a36ec-mpunywfx-preview.agent-sandbox-my-c1-gw.trae.ai',
    'run-agent-6a1d0bb302b8a1f0db3b2a9d-mpuprofp-preview.agent-sandbox-my-c1-gw.trae.ai',
  ],
  serverExternalPackages: ['ws', 'sharp'],
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  typescript: {
    // tsc --noEmit is clean, so let real type errors fail the build instead of
    // being silently ignored. Flip back to true only if an upstream type issue
    // outside our control blocks the build.
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
