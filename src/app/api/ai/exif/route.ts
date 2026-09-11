/**
 * OSIRIS — EXIF / metadati immagine (Delfi)
 * POST /api/ai/exif   multipart: file
 * Puro OSINT: camera, timestamp, software e GPS decodificato in lat/lon.
 * Nessuna GPU coinvolta.
 */
import { proxyDelfi } from '@/lib/delfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return proxyDelfi(req, {
    bucket: 'ai-exif',
    path: '/intel/exif',
    campi: ['file'],
    obbligatori: ['file'],
    max: 30,          // leggero: tetto piu' alto delle route con GPU
    timeoutMs: 60_000,
  });
}
