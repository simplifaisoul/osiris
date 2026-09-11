/**
 * OSIRIS — AI Image Edit classico (Delfi)
 * POST /api/ai/image-edit   multipart: file, prompt
 * Il modello propone una ricetta da whitelist, Delfi la applica con PIL.
 * Le richieste generative tornano con generativo_necessario=true, non fingono.
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyDelfi(req, {
    bucket: 'ai-image-edit',
    path: '/foto/modifica',
    campi: ['file', 'prompt'],
    obbligatori: ['file', 'prompt'],
    max: 10,
  });
}
