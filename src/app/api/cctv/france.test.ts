import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFranceCameras } from './france';
import { APRR_CAMERAS } from './aprr.generated';

afterEach(() => vi.unstubAllGlobals());

const DIRCE_PAGE = `<script>var donneesCamera = [{id: 2, latitude: 45.6403, longitude: 4.64836, zoom: 9},{id: 4, latitude: 47.2979, longitude:2.95234, cap:60, secteur:2, description:"Pouilly-s/-Loire A77 PR117+280", direction:"vers Moulins"}];</script>`;

const DIREST_PAGE = `<script>var liens= [{nom:"Amblans",x :6.43527,y:47.684723,add:"chargerFenetreModale(1)",etat:1},{nom:"Lyoffans",x :6.59052,y:47.6467  ,add:"chargerFenetreModale(24)",etat:1},{nom:"Côte de la Calotine",x :6.4858,y:48.1583,add:"chargerFenetreModale(6)",etat:0}];</script>`;

const LYON = {
  features: [{
    geometry: { coordinates: [4.78129686, 45.76378032] },
    properties: { identifiant: 257, nom: 'Porte de Valvert', libellelong: 'Place Vauboin (Horloge)', url: 'https://download.data.grandlyon.com/files/rdata/pvo_patrimoine_voirie.pvocameracriter/CWTA006.JPG' },
  }],
};

/** Answers each upstream by host; anything not listed fails like a dead host. */
function stubUpstreams(pages: Record<string, (url: URL) => Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const page = pages[url.host];
    if (!page) throw new TypeError('fetch failed');
    return page(url);
  }));
}

const [OFF_AIR, BROKEN, LIVE] = APRR_CAMERAS;
const viewsurfId = (url: string | undefined) => new URL(url!).searchParams.get('id');

/** Viewsurf: one camera on its placeholder, one erroring, one live, the rest unreachable. */
function viewsurf(url: URL): Response {
  const id = url.searchParams.get('id');
  if (id === viewsurfId(OFF_AIR.stream_url)) return new Response(null, { status: 302, headers: { Location: 'https://filmsgieat.viewsurf.com/at/indisponibilite.mp4' } });
  if (id === viewsurfId(BROKEN.stream_url)) return new Response('error', { status: 500 });
  if (id === viewsurfId(LIVE.stream_url)) return new Response(null, { status: 302, headers: { Location: 'https://filmsgieat.viewsurf.com/aprr33/media_1793479800.mp4' } });
  throw new TypeError('fetch failed');
}

describe('fetchFranceCameras', () => {
  it('reads the DIR pages and the Lyon dataset, and keeps the fixed lists when a source is down', async () => {
    stubUpstreams({
      'www.webcams-dir.centre-est.developpement-durable.gouv.fr': () => new Response(DIRCE_PAGE),
      'webcam.dir-est.fr': () => new Response(DIREST_PAGE),
      'data.grandlyon.com': () => Response.json(LYON),
      'gieat.viewsurf.com': viewsurf,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cams = await fetchFranceCameras();
    warn.mockRestore();

    const byId = new Map(cams.map(c => [c.id, c]));
    // The {id: 2, …, zoom: 9} entry is a map sector, not a camera.
    expect(byId.has('dirce-2')).toBe(false);
    expect(byId.get('dirce-4')).toMatchObject({
      lat: 47.2979, lng: 2.95234,
      name: 'Pouilly-s/-Loire A77 PR117+280 (vers Moulins)',
      stream_url: 'https://www.webcams-dir.centre-est.developpement-durable.gouv.fr/streams/last/nce.4.mp4',
      stream_type: 'mp4',
    });
    // Stray spaces in Lyoffans' entry must not drop it; etat:0 is switched off.
    expect(byId.get('direst-24')).toMatchObject({ lat: 47.6467, lng: 6.59052, feed_url: 'https://webcam.dir-est.fr/lastimg/24' });
    expect(byId.has('direst-1')).toBe(true);
    expect(byId.has('direst-6')).toBe(false);
    expect(byId.get('lyon-257')).toMatchObject({ name: 'Place Vauboin (Horloge) (vers Porte de Valvert)', city: 'Lyon' });
    // Viewsurf's placeholder and its 500 drop a camera; a camera it never
    // answered for is kept, since that says nothing about the camera.
    expect(byId.has(OFF_AIR.id)).toBe(false);
    expect(byId.has(BROKEN.id)).toBe(false);
    expect(byId.has(LIVE.id)).toBe(true);
    expect(cams.filter(c => c.source === 'APRR')).toHaveLength(APRR_CAMERAS.length - 2);
  });
});
