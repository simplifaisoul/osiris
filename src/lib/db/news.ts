import { getDb } from './client';

export interface NewsEventInput {
  ts: number;
  source: string;
  urlHash: string;
  text: string;
  sentiment: number | null;
  category: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

export interface NewsEvent extends NewsEventInput {
  id: number;
}

/** Append-only insert, deduped by urlHash — a re-fetch of the same article
    is a silent no-op rather than a duplicate row. */
export function insertEvent(event: NewsEventInput): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO news_events (ts, source, url_hash, text, sentiment, category, region, lat, lng)
     VALUES (@ts, @source, @urlHash, @text, @sentiment, @category, @region, @lat, @lng)`
  ).run(event as unknown as Record<string, unknown>);
}

export function getEventsByWindow(
  category: string,
  region: string,
  fromTs: number,
  toTs: number
): NewsEvent[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ts, source, url_hash as urlHash, text, sentiment, category, region, lat, lng
       FROM news_events
       WHERE category = ? AND region = ? AND ts BETWEEN ? AND ?
       ORDER BY ts ASC`
    )
    .all(category, region, fromTs, toTs) as NewsEvent[];
}

/** Daily-bucketed average sentiment for a category, over the trailing
    `days` window — the input series for the event-study module. */
export function getSentimentSeries(category: string, days: number): { ts: number; sentiment: number }[] {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `SELECT (ts / 86400000) * 86400000 as ts, AVG(sentiment) as sentiment
       FROM news_events
       WHERE category = ? AND ts > ? AND sentiment IS NOT NULL
       GROUP BY (ts / 86400000) * 86400000
       ORDER BY (ts / 86400000) * 86400000 ASC`
    )
    .all(category, since) as { ts: number; sentiment: number }[];
}
