import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

export const GDACS_DISASTER_SOURCE_ID = 'gdacs-disasters' as const;

export interface GdacsRawItem {
  guid: string | null;
  title: string;
  link: string | null;
  description: string | null;
  pubDate: string;
  eventType: string;
  latitude: number;
  longitude: number;
  rawXml: string;
}

export interface NormalisedGdacsDisaster {
  sourceId: typeof GDACS_DISASTER_SOURCE_ID;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  title: string;
  description: string | null;
  link: string | null;
  eventType: string;
  longitude: number;
  latitude: number;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: GdacsRawItem;
  metadata: {
    provider: 'GDACS';
    format: 'rss';
    stableIdentifierSource: 'guid' | 'link' | 'title_pubdate_coordinates';
    item_content_hash: string;
  };
}

export interface NormalisedGdacsFeed {
  sourceId: typeof GDACS_DISASTER_SOURCE_ID;
  upstreamTimestamp: Date | null;
  records: NormalisedGdacsDisaster[];
}

export class GdacsNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GdacsNormalisationError';
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tagValue(itemXml: string, tag: string): string | null {
  const escaped = tag.replace(':', '\\:');
  const match = itemXml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'),
  );
  return match?.[1] === undefined ? null : decodeXmlEntities(match[1]);
}

function finiteCoordinate(value: string | null, name: string): number {
  if (value === null) {
    throw new GdacsNormalisationError(`GDACS item missing ${name}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new GdacsNormalisationError(`GDACS item has invalid ${name}`);
  }
  return parsed;
}

function parsePublishedAt(value: string | null): Date {
  if (value === null) {
    throw new GdacsNormalisationError('GDACS item missing pubDate');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new GdacsNormalisationError(`GDACS item has invalid pubDate: ${value}`);
  }
  return parsed;
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableIdentifier(item: GdacsRawItem): {
  source: NormalisedGdacsDisaster['metadata']['stableIdentifierSource'];
  value: string;
} {
  if (item.guid !== null && item.guid.length > 0) {
    return { source: 'guid', value: item.guid };
  }
  if (item.link !== null && item.link.length > 0) {
    return { source: 'link', value: item.link };
  }
  return {
    source: 'title_pubdate_coordinates',
    value: `${item.title}|${item.pubDate}|${item.latitude}|${item.longitude}`,
  };
}

function parseItem(itemXml: string): NormalisedGdacsDisaster {
  const title = tagValue(itemXml, 'title');
  if (title === null || title.length === 0) {
    throw new GdacsNormalisationError('GDACS item missing title');
  }

  const publishedAt = parsePublishedAt(tagValue(itemXml, 'pubDate'));
  const latitude = finiteCoordinate(tagValue(itemXml, 'geo:lat'), 'geo:lat');
  const longitude = finiteCoordinate(tagValue(itemXml, 'geo:long'), 'geo:long');
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new GdacsNormalisationError('GDACS item coordinates are out of range');
  }

  const eventType = tagValue(itemXml, 'gdacs:eventtype') ?? 'UNK';
  const rawItem: GdacsRawItem = {
    guid: tagValue(itemXml, 'guid'),
    title,
    link: tagValue(itemXml, 'link'),
    description: tagValue(itemXml, 'description'),
    pubDate: publishedAt.toUTCString(),
    eventType,
    latitude,
    longitude,
    rawXml: itemXml,
  };
  const id = stableIdentifier(rawItem);
  const contentHash = hashText(itemXml);

  return {
    sourceId: GDACS_DISASTER_SOURCE_ID,
    sourceEventId: hashText(id.value),
    occurredAt: publishedAt,
    sourceUpdatedAt: publishedAt,
    title,
    description: rawItem.description,
    link: rawItem.link,
    eventType,
    longitude,
    latitude,
    contentHash,
    evidenceClassification: 'reported',
    rawPayload: rawItem,
    metadata: {
      provider: 'GDACS',
      format: 'rss',
      stableIdentifierSource: id.source,
      item_content_hash: contentHash,
    },
  };
}

export function normaliseGdacsDisasterFeed(body: Buffer): NormalisedGdacsFeed {
  if (!Buffer.isBuffer(body)) {
    throw new GdacsNormalisationError('GDACS response body must be a Buffer');
  }

  const xml = body.toString('utf8');
  if (!/<rss[\s>]/i.test(xml) && !/<rdf:RDF[\s>]/i.test(xml)) {
    throw new GdacsNormalisationError('GDACS response is not an RSS document');
  }

  const rawItems = xml.split(/<item(?:\s[^>]*)?>/i).slice(1);
  const records = rawItems.map((rawItem) => {
    const itemXml = rawItem.split(/<\/item>/i)[0];
    if (itemXml === undefined || itemXml.trim().length === 0) {
      throw new GdacsNormalisationError('GDACS item is empty');
    }
    return parseItem(itemXml);
  });

  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.sourceEventId)) {
      throw new GdacsNormalisationError(`Duplicate GDACS event id: ${record.sourceEventId}`);
    }
    seen.add(record.sourceEventId);
  }

  const latest = records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);

  return {
    sourceId: GDACS_DISASTER_SOURCE_ID,
    upstreamTimestamp: latest,
    records,
  };
}
