/**
 * OSIRIS — Face Intel (Delfi / DeepFace)
 * POST /api/ai/face   multipart: image           -> eta', genere, emozione
 * POST /api/ai/face   multipart: image1, image2  -> confronto fra due volti
 * ⚠ Delfi usa i campi `image` / `image1`+`image2`, NON `file`.
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  // il confronto si riconosce dalla presenza di image2: instrada su /df/verify
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) {
    return Response.json({ error: 'Attesa una form multipart.' }, { status: 400 });
  }
  const clone = req.clone();
  let confronto = false;
  try {
    const peek = await clone.formData();
    confronto = peek.get('image2') !== null;
  } catch {
    /* lascia decidere alla validazione sotto */
  }

  return confronto
    ? proxyDelfi(req, {
        bucket: 'ai-face',
        path: '/df/verify',
        campi: ['image1', 'image2'],
        obbligatori: ['image1', 'image2'],
        max: 10,
      })
    : proxyDelfi(req, {
        bucket: 'ai-face',
        path: '/df/analyze',
        campi: ['image'],
        obbligatori: ['image'],
        max: 10,
      });
}
