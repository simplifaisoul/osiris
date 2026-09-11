/**
 * OSIRIS — AI Mask da testo (Delfi)
 * POST /api/ai/mask   multipart: file, testo, [soglia], [allarga], [sam]
 * CLIPSeg trova l'area descritta, SAM ne rende netti i bordi.
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyDelfi(req, {
    bucket: 'ai-mask',
    path: '/foto/maschera',
    campi: ['file', 'testo', 'soglia', 'allarga', 'sam'],
    obbligatori: ['file', 'testo'],
    max: 10,
  });
}
