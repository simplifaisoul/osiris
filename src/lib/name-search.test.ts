import { describe, it, expect, vi } from 'vitest';
import {
  validateName, normalizeName, matchOf, handleVariants, handlesInUse, pivotLinks, htmlToText, safeHttpUrl, placeText,
  fromGithubUser, fromStackOverflow, fromMastodon, fromBluesky, wikidataPeople, fromWikidata, fediverseUrl,
  openAlexAuthors, fromOpenAlex, searchSource, locationSignals, placesToGeocode, placeKey, githubSearchUrl,
  type NameProfile, type WdEntity, type PlacePoint,
} from './name-search';

// Every person here is made up; the shapes are the APIs' own.
const Q = 'Ada Quill';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const profile = (over: Partial<NameProfile>): NameProfile => ({ source: 'github', id: 'x', name: Q, url: 'https://example.org', links: [], facts: [], match: 'exact', ...over });

describe('the name', () => {
  it('takes names in any alphabet, with accents, hyphens and apostrophes', () => {
    expect(validateName('José García-López')).toBeNull();
    expect(validateName("Siobhán O'Neill")).toBeNull();
    expect(validateName('Ada Quill')).toBeNull();
    expect(validateName('李小龍')).toBeNull();
  });

  it('turns away what is not a name', () => {
    expect(validateName('')).not.toBeNull();
    expect(validateName('a')).not.toBeNull();
    expect(validateName('<script>')).not.toBeNull();
    expect(validateName('ada123')).not.toBeNull();
    expect(validateName('A'.repeat(81))).not.toBeNull();
  });

  it('matches the same name however it is cased or accented, and every word of it', () => {
    expect(normalizeName('  ADA  Quíll ')).toBe('ada quill');
    expect(matchOf(Q, 'ada quill')).toBe('exact');
    expect(matchOf('Jose Garcia', 'José García')).toBe('exact');
    expect(matchOf(Q, 'Ada B. Quill')).toBe('words');
    expect(matchOf(Q, 'Someone Else', 'adaquill')).toBe('words');
    expect(matchOf(Q, 'Ada Beatrix Quill')).toBe('words');
    expect(matchOf(Q, 'Ada B. C. Quill Jr.')).toBe('words');
    expect(matchOf(Q, 'Ada Quillfeather')).toBeNull();
    expect(matchOf(Q, 'Ada Lovelace')).toBeNull();
  });

  it('does not take a sentence that holds the name for the name', () => {
    expect(matchOf(Q, 'Ada Quill is a fraud')).toBeNull();
    expect(matchOf(Q, 'ADA QUILL GRACE HOPPER')).toBeNull();
    expect(matchOf(Q, "Ada Quill's mentor")).toBeNull();
  });

  it('builds the handles people make from a name, all valid for the username sweep', () => {
    const h = handleVariants('Ada Quill');
    expect(h).toEqual(expect.arrayContaining(['adaquill', 'ada.quill', 'ada_quill', 'aquill', 'quillada']));
    expect(h.length).toBeLessThanOrEqual(8);
    expect(handleVariants('Ada Beatrix Quill')).toContain('adaquill');
    expect(handleVariants('José García')).toContain('josegarcia');
    expect(handleVariants('Madonna')).toEqual(['madonna']);
    expect(handleVariants('李小龍')).toEqual([]);
  });

  it('opens the networks that allow no automated search as plain searches', () => {
    const links = pivotLinks('Ada Quill');
    expect(links.map(l => l.label)).toEqual(['LinkedIn', 'Facebook', 'Instagram', 'X', 'TikTok']);
    expect(links[0].url).toBe('https://www.linkedin.com/search/results/people/?keywords=Ada%20Quill');
    expect(links[2].url).toContain('site%3Ainstagram.com');
  });
});

describe('text from the wire', () => {
  it('reads HTML bios and encoded names as plain text', () => {
    expect(htmlToText('<p>Maker &amp; tinkerer<br/>Ada&#39;s &#x1F600; page</p>')).toBe("Maker & tinkerer Ada's 😀 page");
  });

  it('keeps only http(s) links, giving a bare domain https', () => {
    expect(safeHttpUrl('adaquill.example')).toBe('https://adaquill.example/');
    expect(safeHttpUrl('https://adaquill.example/blog')).toBe('https://adaquill.example/blog');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('mailto:ada@adaquill.example')).toBeUndefined();
    expect(safeHttpUrl('')).toBeUndefined();
  });

  it('places a town, not "Remote", a planet, a link or an emoji', () => {
    expect(placeText('Lyon, France')).toBe('Lyon, France');
    expect(placeText('Remote')).toBeUndefined();
    expect(placeText('Earth 🌍')).toBeUndefined();
    expect(placeText('🌍')).toBeUndefined();
    expect(placeText('https://adaquill.example')).toBeUndefined();
    expect(placeText(null)).toBeUndefined();
  });
});

describe('each source', () => {
  it('GitHub: name, place, company and the links the profile lists', () => {
    const p = fromGithubUser({
      login: 'aquill', name: 'Ada Quill', html_url: 'https://github.com/aquill', bio: 'Compilers.', company: '@quillworks',
      blog: 'adaquill.example', location: 'Lyon, France', twitter_username: 'adaquill', followers: 1200, public_repos: 34, created_at: '2014-05-01T00:00:00Z',
    }, Q);
    expect(p).toMatchObject({ source: 'github', handle: 'aquill', name: 'Ada Quill', org: '@quillworks', location: 'Lyon, France', basis: 'profile', match: 'exact' });
    expect(p!.links).toEqual([{ label: 'Website', url: 'https://adaquill.example/' }, { label: 'X', url: 'https://x.com/adaquill' }]);
    expect(p!.facts).toEqual(['1,200 followers', '34 public repos', 'joined 2014']);
    // A profile with no name of its own stands on GitHub's match; one whose name is a sentence does not.
    expect(fromGithubUser({ login: 'adaquill', html_url: 'https://github.com/adaquill' }, Q)?.match).toBe('words');
    expect(fromGithubUser({ login: 'troll', name: 'Ada Quill is a fraud', html_url: 'https://github.com/troll' }, Q)).toBeNull();
  });

  it('Stack Overflow: decodes names and drops people the fuzzy search added', () => {
    const list = fromStackOverflow({ items: [
      { user_id: 1, display_name: 'Ada Quill', link: 'https://stackoverflow.com/users/1/ada-quill', location: 'Lyon, France', reputation: 5400, creation_date: 1400000000 },
      { user_id: 2, display_name: 'Ada Quill&#39;s twin', link: 'https://stackoverflow.com/users/2/x' },
      { user_id: 3, display_name: 'Adam Quillan', link: 'https://stackoverflow.com/users/3/x' },
      { user_id: 4, display_name: 'Ada O&#39;Neill Quill', link: 'https://stackoverflow.com/users/4/x' },
    ] }, Q);
    expect(list.map(p => [p.name, p.match])).toEqual([['Ada Quill', 'exact'], ["Ada O'Neill Quill", 'words']]);
    expect(list[0].facts).toEqual(['5,400 reputation', 'joined 2014']);
  });

  it('Mastodon: leaves out people who opted out of discovery, reads a Location field and verified links', () => {
    const list = fromMastodon({ accounts: [
      { id: '1', acct: 'adaquill', display_name: 'Ada Quill', url: 'https://mastodon.social/@adaquill', note: '<p>Writes code.</p>',
        fields: [
          { name: 'Location', value: 'Lyon' },
          { name: 'Site', value: '<a href="https://adaquill.example" rel="me">adaquill.example</a>', verified_at: '2024-01-01T00:00:00Z' },
          { name: 'Bad', value: '<a href="javascript:alert(1)">x</a>' },
        ], followers_count: 80, statuses_count: 900 },
      { id: '2', acct: 'ada@other.example', display_name: 'Ada Quill', url: 'https://other.example/@ada', discoverable: false },
      { id: '3', acct: 'quillbot', display_name: 'Ada Quill Bot', url: 'https://mastodon.social/@quillbot', bot: true },
    ] }, Q);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ handle: 'adaquill@mastodon.social', location: 'Lyon', bio: 'Writes code.' });
    expect(list[0].links).toEqual([{ label: 'Site ✓', url: 'https://adaquill.example/' }]);
  });

  it('Bluesky: leaves out accounts hidden from signed-out viewers and broken handles', () => {
    const list = fromBluesky({ actors: [
      { did: 'did:plc:a', handle: 'adaquill.bsky.social', displayName: 'Ada' },
      { did: 'did:plc:b', handle: 'ada.example', displayName: 'Ada Quill', labels: [{ val: '!no-unauthenticated' }] },
      { did: 'did:plc:c', handle: 'handle.invalid', displayName: 'Ada Quill' },
    ] }, Q);
    expect(list.map(p => [p.handle, p.match, p.url])).toEqual([['adaquill.bsky.social', 'words', 'https://bsky.app/profile/adaquill.bsky.social']]);
  });

  it('Wikidata: only people, their linked accounts, and where they live now', () => {
    const item = (id: string) => ({ value: { id } });
    const claim = (value: unknown, extra: object = {}) => ({ mainsnak: { datavalue: { value } }, rank: 'normal', ...extra });
    const ended = { qualifiers: { P580: [{ datavalue: { value: { time: '+2001-00-00T00:00:00Z' } } }], P582: [{ datavalue: { value: { time: '+2010-00-00T00:00:00Z' } } }] } };
    const since = (y: number) => ({ qualifiers: { P580: [{ datavalue: { value: { time: `+${y}-00-00T00:00:00Z` } } }] } });
    const person: WdEntity = {
      id: 'Q1', labels: { en: { value: 'Ada Quill' } }, descriptions: { en: { value: 'fictional engineer' } },
      sitelinks: { enwiki: { title: 'Ada Quill', url: 'https://en.wikipedia.org/wiki/Ada_Quill' } },
      claims: {
        P31: [claim(item('Q5').value)],
        P106: [claim(item('Q10').value)],
        P108: [claim(item('Q20').value, ended), claim(item('Q21').value, since(2011))],
        P551: [claim(item('Q30').value, ended), claim(item('Q31').value, since(2011)), { ...claim(item('Q32').value), rank: 'deprecated' }],
        P6634: [claim('adaquill')],
        P2003: [claim('ada.quill')],
        P4033: [claim('ada@social.example')],
        P856: [claim('javascript:alert(1)')],
      },
    };
    const notAPerson: WdEntity = { id: 'Q2', labels: { en: { value: 'Ada Quill' } }, claims: { P31: [claim(item('Q571').value)] } };
    const { people, refs, residences } = wikidataPeople({ Q1: person, Q2: notAPerson }, [{ id: 'Q1' }, { id: 'Q2' }], Q);
    expect(people.map(p => p.entity.id)).toEqual(['Q1']);
    expect(refs).toEqual(expect.arrayContaining(['Q10', 'Q20', 'Q21']));
    // The ended home and the deprecated one are not "now".
    expect(residences).toEqual(['Q31']);

    const labels: Record<string, WdEntity> = { Q10: { id: 'Q10', labels: { en: { value: 'engineer' } } }, Q21: { id: 'Q21', labels: { en: { value: 'Quillworks' } } } };
    const places: Record<string, WdEntity> = { Q31: { id: 'Q31', labels: { en: { value: 'Lyon' } }, claims: { P625: [claim({ latitude: 45.76, longitude: 4.84 })] } } };
    const p = fromWikidata(person, 'exact', labels, places);
    expect(p).toMatchObject({ source: 'wikidata', name: 'Ada Quill', org: 'Quillworks', location: 'Lyon', coords: { lat: 45.76, lng: 4.84 }, basis: 'residence', bio: 'fictional engineer' });
    expect(p.links).toEqual([
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ada_Quill' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/adaquill' },
      { label: 'Instagram', url: 'https://www.instagram.com/ada.quill/' },
      { label: 'Mastodon', url: 'https://social.example/@ada' },
    ]);
  });

  it('reads a fediverse address as its profile link', () => {
    expect(fediverseUrl('@ada@social.example')).toBe('https://social.example/@ada');
    expect(fediverseUrl('not an address')).toBeUndefined();
  });

  it('OpenAlex: researchers, placed where their institution is', () => {
    const { authors, institutions } = openAlexAuthors({ results: [
      { id: 'https://openalex.org/A1', display_name: 'Ada B. Quill', works_count: 40, cited_by_count: 900,
        last_known_institutions: [{ id: 'https://openalex.org/I9', display_name: 'University of Lyon' }], topics: [{ display_name: 'Compilers' }], orcid: 'https://orcid.org/0000-0000-0000-0001' },
      { id: 'https://openalex.org/A2', display_name: 'Someone Else' },
    ] }, Q);
    expect(authors).toHaveLength(1);
    expect(institutions).toEqual(['I9']);
    const p = fromOpenAlex(authors[0].author, authors[0].match, { I9: { id: 'https://openalex.org/I9', display_name: 'University of Lyon', geo: { city: 'Lyon', country: 'France', latitude: 45.75, longitude: 4.85 } } });
    expect(p).toMatchObject({ id: 'A1', org: 'University of Lyon', location: 'Lyon, France', coords: { lat: 45.75, lng: 4.85 }, basis: 'institution', match: 'words', bio: 'Publishes on Compilers' });
    expect(p.links).toEqual([{ label: 'ORCID', url: 'https://orcid.org/0000-0000-0000-0001' }]);
  });
});

describe('searchSource', () => {
  const signal = () => new AbortController().signal;

  it('reads GitHub profiles in full, and keeps a hit as a lead when its profile cannot be read', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === githubSearchUrl(Q)) return json({ items: [
        { login: 'aquill', html_url: 'https://github.com/aquill', type: 'User' },
        { login: 'quill-org', html_url: 'https://github.com/quill-org', type: 'Organization' },
        { login: 'adaq', html_url: 'https://github.com/adaq', type: 'User' },
      ] });
      if (url.endsWith('/users/aquill')) return json({ login: 'aquill', name: 'Ada Quill', html_url: 'https://github.com/aquill', location: 'Lyon' });
      return json({ message: 'API rate limit exceeded' }, 403);
    });
    const list = await searchSource('github', Q, signal(), fetchImpl as typeof fetch);
    expect(list.map(p => [p.handle, p.match, p.location])).toEqual([['aquill', 'exact', 'Lyon'], ['adaq', 'words', undefined]]);
    // The organisation is not a person, so it is not read.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('says plainly when a source has used up its allowance', async () => {
    const fetchImpl = vi.fn(async () => json({ message: 'API rate limit exceeded' }, 403));
    await expect(searchSource('github', Q, signal(), fetchImpl as typeof fetch)).rejects.toThrow(/allowance/);
  });

  it('asks Wikidata for the hits, then the labels and places their records name', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      expect((init?.headers as Record<string, string>)['Api-User-Agent']).toMatch(/OSIRIS/);
      if (url.includes('wbsearchentities')) return json({ search: [{ id: 'Q1' }] });
      if (url.includes('props=labels%7C') || url.includes('props=labels|descriptions')) {
        return json({ entities: { Q1: { id: 'Q1', labels: { en: { value: 'Ada Quill' } }, claims: {
          P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
          P551: [{ mainsnak: { datavalue: { value: { id: 'Q31' } } } }],
        } } } });
      }
      if (url.includes('props=labels|claims')) return json({ entities: { Q31: { id: 'Q31', labels: { en: { value: 'Lyon' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 45.76, longitude: 4.84 } } } }] } } } });
      return json({ entities: {} });
    });
    const list = await searchSource('wikidata', Q, signal(), fetchImpl as typeof fetch);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Ada Quill', location: 'Lyon', coords: { lat: 45.76, lng: 4.84 } });
    expect(urls.every(u => u.includes('origin=*'))).toBe(true);
  });
});

describe('location estimate', () => {
  it('counts profiles that put the person in the same town as one place, most agreed first', () => {
    const geocoded = new Map<string, PlacePoint | null>([
      [placeKey('Lyon, France'), { lat: 45.764, lng: 4.836, place: 'Lyon, France' }],
      [placeKey('Villeurbanne'), { lat: 45.766, lng: 4.879, place: 'Villeurbanne' }],
      [placeKey('Tokyo'), { lat: 35.68, lng: 139.69, place: 'Tokyo' }],
      [placeKey('Atlantis'), null],
    ]);
    const signals = locationSignals([
      profile({ source: 'github', id: 'a', location: 'Lyon, France' }),
      profile({ source: 'stackoverflow', id: 'b', location: 'Villeurbanne' }),
      profile({ source: 'openalex', id: 'c', location: 'Lyon, France', coords: { lat: 45.75, lng: 4.85 } }),
      profile({ source: 'mastodon', id: 'd', location: 'Tokyo' }),
      profile({ source: 'bluesky', id: 'e', location: 'Atlantis' }),
      profile({ source: 'wikidata', id: 'f' }),
    ], geocoded);
    expect(signals.map(s => [s.place, s.profiles.length])).toEqual([['Lyon, France', 3], ['Tokyo', 1]]);
    expect(signals[0].sources).toEqual(['github', 'stackoverflow', 'openalex']);
  });

  it('geocodes each location text once, and none that carry coordinates already', () => {
    expect(placesToGeocode([
      profile({ id: 'a', location: 'Lyon' }),
      profile({ id: 'b', location: ' lyon ' }),
      profile({ id: 'c', location: 'Paris', coords: { lat: 48.85, lng: 2.35 } }),
      profile({ id: 'd' }),
    ])).toEqual(['Lyon']);
  });

  it('offers the handles the profiles found already use, when they are built from the name', () => {
    expect(handlesInUse([
      profile({ source: 'github', handle: 'AQuill' }),
      profile({ source: 'github', handle: 'nightowl42' }),
      profile({ source: 'mastodon', handle: 'adaquill@mastodon.social' }),
      profile({ source: 'bluesky', handle: 'adaquill.bsky.social' }),
      profile({ source: 'bluesky', handle: 'ada.example' }),
      profile({ source: 'stackoverflow' }),
    ], Q)).toEqual(['aquill', 'adaquill']);
  });

  it('does not place a profile that wrote "Location" where its town goes', () => {
    expect(placeText('Location')).toBeUndefined();
    expect(placeText('Undisclosed')).toBeUndefined();
  });
});
