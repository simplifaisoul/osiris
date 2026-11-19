/**
 * OSIRIS vision: following what the detector finds from one frame to the
 * next, so a watch of a live camera can say how many vehicles it saw in all,
 * not only how many were in view at once.
 *
 * Each frame's boxes are matched to the tracks so far. A track expects its
 * object where its last sightings were heading, and takes the nearest box of
 * the same kind within reach, the closest pairs first; reach is measured in
 * the object's own size, so it means the same near the camera and far up the
 * road. A box that matches nothing starts a track. A track is counted once it
 * has been seen twice, so a box the detector imagines for one frame is not.
 * A moving track unseen for GONE_MS has left; one that has stood still (a
 * parked car the detector loses now and then) is kept for the whole watch,
 * so it is not counted again when it is found again.
 *
 * Like the detector's counts, these are a floor: a vehicle it never sees
 * clearly is never counted, and two that pass behind a lorry together may be
 * counted as one.
 */
import { VEHICLES, type Detection, type Label } from './detect';

export type Kind = 'vehicle' | 'person';

const kindOf = (label: Label): Kind | null =>
  label === 'person' ? 'person' : (VEHICLES as readonly Label[]).includes(label) ? 'vehicle' : null;

type Box = Detection['box'];

interface Track {
  kind: Kind;
  /** Its number in the count of its kind, from 1; 0 until it is counted. */
  n: number;
  /** Where it was last seen, and when (ms). */
  box: Box;
  at: number;
  /** Where its centre was first seen. */
  origin: [number, number];
  /** Its centre's velocity in px per ms, once it has been seen twice. */
  v: [number, number] | null;
  hits: number;
  /** Its label read each time, weighted by score: a car read once as a truck stays a car. */
  votes: Partial<Record<Label, number>>;
  /** The farthest its centre has been from where it was first seen, in its own lengths. */
  travel: number;
}

/** What a watch has counted so far. */
export interface Tally {
  /** Everything counted, by the label each was read as most often. */
  counts: Partial<Record<Label, number>>;
  vehicles: number;
  people: number;
  /** Of the vehicles, those that moved and those that stood still all the time they were seen. */
  moving: number;
  standing: number;
}

/** A moving track unseen this long has left the picture. */
export const GONE_MS = 2000;
/** A counted track that has travelled less than this, in its own lengths, stood still. */
const STILL = 0.5;

const centre = (b: Box): [number, number] => [b[0] + b[2] / 2, b[1] + b[3] / 2];
const length = (b: Box) => Math.max(b[2], b[3], 1);

/**
 * How far a track's object may be from where it was expected, in its own
 * lengths, after `dt` seconds. Without a heading (seen once) it may have gone
 * anywhere a fast car could: a car at motorway speed covers about five of its
 * lengths a second.
 */
const reach = (t: Track, dt: number) => (t.v ? 0.8 + dt : Math.min(4, 0.8 + 5 * dt));

/** Counted, and has hardly moved: a parked or queued vehicle, or someone standing. */
const standing = (t: Track) => t.n > 0 && t.travel < STILL;

export class Tracker {
  private tracks: Track[] = [];
  /** Counted tracks that have left, kept for the tally. */
  private left: Track[] = [];
  private next: Record<Kind, number> = { vehicle: 0, person: 0 };

  /**
   * Matches a frame's boxes, taken at `at` (ms), to the tracks. Returns each
   * box's number in the count (null for one not counted yet, or not a vehicle
   * or a person), and which boxes were counted on this frame.
   */
  update(detections: Detection[], at: number): { numbers: (number | null)[]; fresh: number[] } {
    const pairs: { t: number; d: number; cost: number }[] = [];
    detections.forEach((d, j) => {
      const kind = kindOf(d.label);
      if (!kind) return;
      const [cx, cy] = centre(d.box);
      this.tracks.forEach((t, i) => {
        if (t.kind !== kind || at <= t.at) return;
        const ratio = length(d.box) / length(t.box);
        if (ratio > 2.2 || ratio < 1 / 2.2) return;
        const dt = at - t.at;
        // Long lost and standing still: expected exactly where it stood, its jitter not run on for seconds.
        const parked = standing(t) && dt > GONE_MS;
        const lead = parked ? 0 : Math.min(dt, GONE_MS);
        const [px, py] = centre(t.box);
        const ex = px + (t.v ? t.v[0] * lead : 0), ey = py + (t.v ? t.v[1] * lead : 0);
        const off = Math.hypot(cx - ex, cy - ey) / length(t.box);
        const limit = parked ? STILL : reach(t, lead / 1000);
        if (off <= limit) pairs.push({ t: i, d: j, cost: off / limit });
      });
    });
    pairs.sort((a, b) => a.cost - b.cost);

    const numbers: (number | null)[] = detections.map(() => null);
    const fresh: number[] = [];
    const taken = new Set<number>();
    const matched = new Set<number>();
    for (const { t: i, d: j } of pairs) {
      if (matched.has(i) || taken.has(j)) continue;
      matched.add(i);
      taken.add(j);
      const t = this.tracks[i];
      const d = detections[j];
      const [px, py] = centre(t.box);
      const [cx, cy] = centre(d.box);
      const dt = at - t.at;
      const v: [number, number] = [(cx - px) / dt, (cy - py) / dt];
      t.v = t.v ? [(t.v[0] + v[0]) / 2, (t.v[1] + v[1]) / 2] : v;
      t.box = d.box;
      t.at = at;
      t.hits++;
      t.votes[d.label] = (t.votes[d.label] ?? 0) + d.score;
      t.travel = Math.max(t.travel, Math.hypot(cx - t.origin[0], cy - t.origin[1]) / length(d.box));
      if (!t.n && t.hits >= 2) {
        t.n = ++this.next[t.kind];
        fresh.push(j);
      }
      if (t.n) numbers[j] = t.n;
    }

    // What has left: moving tracks unseen too long, and anything seen only once that was not found again.
    const kept: Track[] = [];
    this.tracks.forEach((t, i) => {
      if (matched.has(i) || at - t.at <= GONE_MS || standing(t)) kept.push(t);
      else if (t.n) this.left.push(t);
    });
    this.tracks = kept;

    detections.forEach((d, j) => {
      const kind = kindOf(d.label);
      if (!kind || taken.has(j)) return;
      this.tracks.push({ kind, n: 0, box: d.box, at, origin: centre(d.box), v: null, hits: 1, votes: { [d.label]: d.score }, travel: 0 });
    });
    return { numbers, fresh };
  }

  tally(): Tally {
    const counts: Partial<Record<Label, number>> = {};
    let moving = 0, still = 0;
    for (const t of this.tracks.concat(this.left)) {
      if (!t.n) continue;
      const label = (Object.entries(t.votes) as [Label, number][]).sort((a, b) => b[1] - a[1])[0][0];
      counts[label] = (counts[label] ?? 0) + 1;
      if (t.kind === 'vehicle') { if (standing(t)) still++; else moving++; }
    }
    return { counts, vehicles: this.next.vehicle, people: this.next.person, moving, standing: still };
  }
}
