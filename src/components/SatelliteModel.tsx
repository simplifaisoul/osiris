'use client';

import type { ReactNode } from 'react';
import ModelView from '@/components/ModelView';
import { buildSatelliteModel, satelliteModelKind, TRUE_SIZE_KINDS } from '@/lib/satellite-models';

/** The satellite card's 3D picture: a model of the selected satellite's kind. */
export default function SatelliteModel({ name, mission, category, altKm, noradId, corner }: {
  name: string;
  mission?: string;
  category?: string;
  altKm: number;
  noradId?: string;
  /** The picture toggle, drawn in the bottom-left corner. */
  corner?: ReactNode;
}) {
  const { kind, label } = satelliteModelKind({ name, mission, category, altKm });
  return (
    <ModelView
      buildKey={`${kind}:${noradId ?? ''}`}
      build={THREE => buildSatelliteModel(THREE, kind, Number(noradId) || 1)}
      label={label}
      // Only the designs built to their real size say how big they are.
      sizeText={m => (TRUE_SIZE_KINDS.has(kind) ? `≈ ${m.spanM >= 10 ? Math.round(m.spanM) : m.spanM.toFixed(1)} M ACROSS` : null)}
      note="Illustrative model of this kind of satellite, not a photograph · drag to turn"
      corner={corner}
    />
  );
}
