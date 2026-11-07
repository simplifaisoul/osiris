import type { Metadata } from 'next';
import CutoutView from '@/components/cutout/CutoutView';
import { boxProblem, parseBox } from '@/lib/cutout';

export const metadata: Metadata = {
  title: 'Cut-out',
  description: 'A piece of the OSIRIS map in 3D, with the CCTV cameras and network hosts inside it.',
  robots: { index: false },
};

/** `/cutout?bbox=west,south,east,north`: a box of the map opened on its own. */
export default async function CutoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const box = parseBox(typeof q.bbox === 'string' ? q.bbox : null);
  const problem = box ? boxProblem(box) : 'This link has no area in it. Draw a cut-out on the OSIRIS map to make one.';
  return <CutoutView box={box} problem={problem} />;
}
