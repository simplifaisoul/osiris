import { describe, expect, it } from 'vitest';
import { isQueryableService, queryableResults } from './arcgis-catalog';

describe('ArcGIS catalog results', () => {
  it('keeps only items whose URL is a REST service', () => {
    expect(isQueryableService('https://services1.arcgis.com/abc/arcgis/rest/services/Lines/FeatureServer')).toBe(true);
    expect(isQueryableService('https://gis.wcc.govt.nz/arcgis/rest/services/Plan/Plan/MapServer/32')).toBe(true);
    expect(isQueryableService('https://experience.arcgis.com/experience/06e44781378e48bab2cc352be7098c1c')).toBe(false);
    expect(isQueryableService('https://www.arcgis.com/home/item.html?id=abc')).toBe(false);
    expect(isQueryableService(null)).toBe(false);
    expect(isQueryableService(undefined)).toBe(false);
  });

  it('preserves the catalog order and stops at the limit', () => {
    const items = [
      { id: 'a', url: 'https://x/arcgis/rest/services/A/FeatureServer' },
      { id: 'b' },
      { id: 'c', url: 'https://experience.arcgis.com/experience/c' },
      { id: 'd', url: 'https://x/arcgis/rest/services/D/FeatureServer' },
      { id: 'e', url: 'https://x/arcgis/rest/services/E/MapServer' },
    ];
    expect(queryableResults(items, 2).map(i => i.id)).toEqual(['a', 'd']);
    expect(queryableResults(items, 20).map(i => i.id)).toEqual(['a', 'd', 'e']);
  });
});
