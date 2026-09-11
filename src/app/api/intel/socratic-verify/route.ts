import { NextRequest, NextResponse } from 'next/server';
import { runFullSocraticAudit, SocraticVerificationRequest } from '@/lib/socratic-reasoning-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = (body.target_data || body) as any;

    const request: SocraticVerificationRequest = {
      id: payload.id || body.target_id || 'UNKNOWN-TARGET',
      name: payload.name || payload.callsign || body.name || '미확인 표적',
      domain: body.target_domain || body.domain || payload.domain || payload.target_type || 'flight',
      country: payload.country || body.country || '미상',
      model: payload.model || body.model || '',
      altitude: payload.altitude != null ? Number(payload.altitude) : 0,
      speed: payload.speed != null ? Number(payload.speed) : 0,
      coords: payload.coords || body.coords,
      iff: payload.iff || body.iff || (payload.country === '북한' ? 'HOSTILE' : 'FRIENDLY'),
      ocr_extracted_text: body.ocr_extracted_text || payload.ocr_extracted_text || ''
    };

    const auditReport = await runFullSocraticAudit(request);

    return NextResponse.json({
      status: 'success',
      verified: true,
      report: auditReport
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      message: err?.message || '소크라테스 인지 검증 중 오류 발생'
    }, { status: 500 });
  }
}
