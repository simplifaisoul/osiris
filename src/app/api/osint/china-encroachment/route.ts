import { NextResponse } from 'next/server';
import {
  CHINA_ENCROACHMENT_SITES,
  DIALECTIC_STAGE_META,
  withDialecticHonesty,
} from '@/lib/china-encroachment';

export async function GET() {
  const sites = CHINA_ENCROACHMENT_SITES.map(withDialecticHonesty);

  const geojsonFeatures = sites.map((site) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [site.lng, site.lat],
    },
    properties: {
      id: site.id,
      name: site.name,
      chinese_name: site.chinese_name,
      english_name: site.english_name,
      region: site.region,
      region_label: site.region_label,
      threat_level: site.threat_level,
      facility_type: site.facility_type,
      facility_type_label: site.facility_type_label,
      runway_length_m: site.runway_length_m || 0,
      satellite_image: site.satellite_image,
      recon_image: site.recon_image,
      // Honesty: synthesis is INFERENCE — never expose as verified fact
      synthesisJudgmentSource: DIALECTIC_STAGE_META.synthesis.judgmentSource,
      assertiveAllowed: false,
    },
  }));

  return NextResponse.json({
    status: 'success',
    count: sites.length,
    sites,
    dialecticStages: DIALECTIC_STAGE_META,
    judgmentPolicy: {
      synthesisIsInference: true,
      assertiveAllowed: false,
      badgeAllowlist: ['THESIS', 'ANTITHESIS', 'SOURCE', 'HOLD', 'REJECT-UNTIL-EVIDENCE', 'INFERENCE'],
      forbidAssertiveBadges: true,
    },
    geojson: {
      type: 'FeatureCollection',
      features: geojsonFeatures,
    },
    timestamp: new Date().toISOString(),
  });
}
