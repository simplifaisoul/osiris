import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const maxDuration = 300; // Allow Vercel/Next.js to run this route for up to 5 minutes if needed

/* An upload big enough to matter for geolocation, and no bigger. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  /* This route hands an arbitrary upload to a GPU and is allowed to run for
     five minutes (maxDuration above). Unmetered, that is a standing invitation
     to occupy the GPU; the sibling OSINT routes have used this limiter for a
     while. */
  if (isRateLimited(getClientIp(req), 5)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const image = formData.get('image') as File | null;

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large (10 MB maximum)' }, { status: 413 });
    }

    // Default to localhost if not set in .env, but user will set ASTRA_GPU_URL to the Tailscale IP
    const gpuUrl = process.env.ASTRA_GPU_URL || 'http://localhost:8000';

    // We proxy the exact form data over to the GPU server
    const proxyFormData = new FormData();
    proxyFormData.append('image', image);

    console.log(`[ASTRA] Forwarding image to GPU server at ${gpuUrl}/geolocate...`);

    const response = await fetch(`${gpuUrl}/geolocate`, { signal: AbortSignal.timeout(30000),
      method: 'POST',
      body: proxyFormData as any, // Node types sometimes complain about fetch FormData
      // Disable timeout or set very high if using a custom fetch agent, 
      // but native fetch doesn't timeout natively on Node unless specified.
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ASTRA] GPU Server Error:', errorText);
      return NextResponse.json({ error: `GPU Server responded with ${response.status}: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[ASTRA] Proxy Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to connect to GPU server' }, { status: 500 });
  }
}
