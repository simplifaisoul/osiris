/**
 * OSIRIS — AI Inpainting generativo (Delfi / SDXL)
 * POST /api/ai/generate   multipart: file, maschera, prompt, [forza], [passi]
 * Pesante: su Delfi gira in un sottoprocesso, ~30 s, 1-2 in parallelo.
 * Per questo il tetto qui e' piu' basso delle altre route.
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  return proxyDelfi(req, {
    bucket: 'ai-generate',
    path: '/foto/generativo',
    campi: ['file', 'maschera', 'prompt', 'forza', 'passi'],
    obbligatori: ['file', 'maschera', 'prompt'],
    max: 4,                 // Delfi regge 1-2 generazioni insieme: non invitare la coda
    timeoutMs: 600_000,
  });
}
