import { describe, it, expect } from 'vitest';
import { featureServiceTarget, layerQueryUrl } from './route';

/*
 * `service` used to reach fetch() unchecked, which made this route an
 * unauthenticated SSRF primitive: it would request any address a caller named
 * and return the body. Every case below has to be refused before a request is
 * attempted — featureServiceTarget returning null is what stops it.
 */

const refused = (service: string) => expect(featureServiceTarget(service)).toBeNull();

/** The URL the route would actually request for a given service string. */
function queried(service: string): string | null {
  const target = featureServiceTarget(service);
  if (!target) return null;
  return layerQueryUrl(target.root, target.layer ?? 0).toString();
}

describe('refusing a target that is not a public ArcGIS service', () => {
  it('refuses loopback, link-local and private addresses', () => {
    refused('http://127.0.0.1/internal-status');
    refused('https://127.0.0.1/rest/services/x/FeatureServer/0');
    refused('http://169.254.169.254/latest/meta-data/');
    refused('http://[::1]/rest/services/x/FeatureServer/0');
    refused('http://192.168.1.1/admin');
    refused('http://10.0.0.5/rest/services/x/FeatureServer/0');
  });

  it('refuses the fragment trick that defeated the old /query suffixing', () => {
    // "…/internal#" + "/0/query" is all fragment, so the request went to
    // /internal unchanged. Nothing may survive the hash.
    refused('http://127.0.0.1:8080/internal-status#');
    refused('https://evil.example.com/internal#/rest/services/x/FeatureServer/0/query');
    const smuggled = featureServiceTarget(
      'https://services1.arcgis.com/abc/ArcGIS/rest/services/Roads/FeatureServer/0#@evil.example.com',
    );
    expect(smuggled?.root.hostname).toBe('services1.arcgis.com');
    expect(smuggled?.root.hash).toBe('');
  });

  it('refuses a host that is not serving an ArcGIS REST path', () => {
    refused('https://evil.example.com/');
    refused('https://evil.example.com/rest/of/the/owl');
    refused('https://raw.githubusercontent.com/some/repo/main/secrets.json');
  });

  it('refuses a scheme that is not https', () => {
    refused('http://services1.arcgis.com/abc/ArcGIS/rest/services/Roads/FeatureServer/0');
    refused('file:///etc/passwd');
    refused('gopher://127.0.0.1:11211/');
    refused('not a url at all');
  });
});

describe('accepting a real Feature Service', () => {
  const base = 'https://services1.arcgis.com/abc/ArcGIS/rest/services/Roads/FeatureServer';

  it('queries the layer it was given', () => {
    expect(queried(`${base}/3`)).toBe(`${base}/3/query`);
    expect(featureServiceTarget(`${base}/3`)?.layer).toBe(3);
  });

  it('reports a service root as having no layer, rather than assuming 0', () => {
    // Layer ids are the publisher's to choose; one catalogue service numbers
    // its layers 15, 16, 17, so assuming 0 asked for a layer that is not there
    // and the import came back 404. The route asks the service instead.
    expect(featureServiceTarget(base)?.layer).toBeNull();
    expect(featureServiceTarget(`${base}/`)?.layer).toBeNull();
    expect(featureServiceTarget(`${base}`)?.root.toString()).toBe(base);
  });

  it('does not suffix a URL that already asks for /query', () => {
    expect(queried(`${base}/2/query`)).toBe(`${base}/2/query`);
  });

  it('accepts a MapServer and a self-hosted ArcGIS Server', () => {
    expect(featureServiceTarget(`${base.replace('FeatureServer', 'MapServer')}/0`)).not.toBeNull();
    expect(
      featureServiceTarget('https://gis.example.gov/arcgis/rest/services/Public/Parcels/FeatureServer/1'),
    ).not.toBeNull();
  });

  it('drops a query string the caller attached', () => {
    expect(featureServiceTarget(`${base}/0?f=html&token=stolen`)?.root.search).toBe('');
    expect(queried(`${base}/0?f=html&token=stolen`)).toBe(`${base}/0/query`);
  });
});
