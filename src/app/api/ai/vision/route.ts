/**
 * OSIRIS — AI Vision (Delfi)
 * POST /api/ai/vision   multipart: file, [domanda]
 * Analizza un'immagine col modello di visione locale (qwen2.5vl su Delfi).
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyDelfi(req, {
    bucket: 'ai-vision',
    path: '/foto/analizza',
    campi: ['file', 'domanda'],
    obbligatori: ['file'],
    max: 10,
  });
}
