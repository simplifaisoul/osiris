/**
 * OSIRIS — country risk baseline.
 *
 * The `base` numbers below are an editorial judgement, not a measurement.
 * Nobody calibrated them against an outcome dataset, there is no published
 * methodology behind the gap between Ukraine at 85 and China at 35, and two
 * analysts would not independently arrive at the same figures. They are a
 * rough ordering of how disrupted a country currently is, useful for sorting a
 * list and for nothing else.
 *
 * That is not a reason to delete them, but it is a reason to stop shipping
 * them as if they were derived. Every response says `basis: 'editorial'`,
 * carries the review date, and reports the observed component separately from
 * the judgement so a consumer can use one without swallowing the other.
 */

export interface RiskFactor {
  base: number;
  tags: string[];
  /** Names as USGS spells them in an earthquake `place` string. */
  names: string[];
  /** Longer names of somewhere else that contain one of `names`, such as
   *  "south sudan" for Sudan. They are taken out of the place first. */
  excludes?: string[];
}

/** Editorial baseline. `base` is a 0–100 ordering, not a calibrated probability. */
export const RISK_FACTORS: Record<string, RiskFactor> = {
  UA: { base: 85, tags: ['active_conflict', 'infrastructure_damage'], names: ['ukraine'] },
  RU: { base: 72, tags: ['sanctions', 'military_mobilization'], names: ['russia'] },
  IL: { base: 78, tags: ['active_conflict', 'regional_instability'], names: ['israel'] },
  PS: { base: 90, tags: ['active_conflict', 'humanitarian_crisis'], names: ['palestine', 'gaza', 'west bank'] },
  SY: { base: 82, tags: ['post_conflict', 'infrastructure_damage'], names: ['syria'] },
  YE: { base: 88, tags: ['active_conflict', 'humanitarian_crisis'], names: ['yemen'] },
  MM: { base: 76, tags: ['civil_unrest', 'military_junta'], names: ['myanmar', 'burma'] },
  SD: { base: 84, tags: ['active_conflict', 'humanitarian_crisis'], names: ['sudan'], excludes: ['south sudan'] },
  AF: { base: 80, tags: ['post_conflict', 'governance_collapse'], names: ['afghanistan'] },
  KP: { base: 70, tags: ['nuclear_risk', 'isolation'], names: ['north korea'] },
  IR: { base: 68, tags: ['sanctions', 'nuclear_program', 'regional_proxy'], names: ['iran'] },
  CN: { base: 35, tags: ['strategic_competition', 'taiwan_tensions'], names: ['china'] },
  TW: { base: 45, tags: ['invasion_risk', 'semiconductor_dependency'], names: ['taiwan'] },
  VE: { base: 60, tags: ['economic_collapse', 'political_instability'], names: ['venezuela'] },
  HT: { base: 85, tags: ['gang_violence', 'governance_collapse'], names: ['haiti'] },
  LB: { base: 65, tags: ['economic_crisis', 'political_deadlock'], names: ['lebanon'] },
  PK: { base: 55, tags: ['terrorism', 'political_instability'], names: ['pakistan'] },
  SO: { base: 82, tags: ['terrorism', 'state_fragility'], names: ['somalia'] },
  LY: { base: 72, tags: ['divided_government', 'militia_control'], names: ['libya'] },
  ET: { base: 62, tags: ['ethnic_tensions', 'regional_conflicts'], names: ['ethiopia'] },
};

/** When the `base` figures above were last reviewed by a person. */
export const BASELINE_REVIEWED = '2026-09-15';

/**
 * Sums earthquake magnitudes per country from USGS `place` strings.
 *
 * Matching used to be `place.includes(code)` on the two-letter code, which is
 * a substring test against prose: "Papua New Guinea region" contains "ua", so
 * every Papuan earthquake raised Ukraine's score, and "Solomon Islands",
 * "Sonora" and "south of the Fiji Islands" all raised Somalia's. Matching is
 * now on country names at word boundaries.
 *
 * Word boundaries are not enough where one country's name sits inside
 * another's: "50 km E of Juba, South Sudan" holds the whole word "Sudan". A
 * factor lists those longer names under `excludes`.
 */
export function quakeMagnitudeByCountry(
  features: Array<{ properties?: { place?: string; mag?: number } }>,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const feature of features) {
    const rawPlace = feature.properties?.place || '';
    const mag = feature.properties?.mag;
    if (!rawPlace || typeof mag !== 'number' || !Number.isFinite(mag)) continue;

    /* Reduce the place string to space-delimited words, padded at both ends,
       so a name only matches on whole-word boundaries: ' papua new guinea
       region ' does not contain ' ukraine ', where it did contain 'ua'. */
    const place = ` ${rawPlace.toLowerCase().replace(/[^a-z]+/g, ' ').trim()} `;

    for (const [code, factor] of Object.entries(RISK_FACTORS)) {
      /* Only the longer name is removed, so ' sudan south sudan border
         region ' still has a ' sudan ' of its own left to match. */
      const remaining = (factor.excludes || []).reduce(
        (text, other) => text.replaceAll(` ${other} `, ' '),
        place,
      );
      if (factor.names.some(name => remaining.includes(` ${name} `))) {
        totals[code] = (totals[code] || 0) + mag;
      }
    }
  }
  return totals;
}

export interface CountryRisk {
  code: string;
  /** The editorial judgement, unmodified. */
  base_risk: number;
  /** Summed magnitude of recent significant quakes in that country. */
  quake_magnitude: number;
  /** base_risk + quake_magnitude, capped at 100. */
  risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW';
  tags: string[];
  basis: 'editorial';
}

function levelFor(base: number): CountryRisk['risk_level'] {
  if (base >= 80) return 'CRITICAL';
  if (base >= 60) return 'HIGH';
  if (base >= 40) return 'ELEVATED';
  return 'LOW';
}

/** Combines the editorial baseline with observed quake activity, keeping the two visible. */
export function buildCountryRisk(quakeMagnitude: Record<string, number>): CountryRisk[] {
  return Object.entries(RISK_FACTORS)
    .map(([code, factor]) => {
      const quake = quakeMagnitude[code] || 0;
      return {
        code,
        base_risk: factor.base,
        quake_magnitude: quake,
        risk_score: Math.min(100, factor.base + quake),
        risk_level: levelFor(factor.base),
        tags: factor.tags,
        basis: 'editorial' as const,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);
}
