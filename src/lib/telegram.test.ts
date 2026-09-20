import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities, fingerprint, htmlToText, parseChannelPage, parseViews, splitHeadline, stripSignOff,
} from './telegram';

/*
 * Fixtures follow the structure of real t.me/s/ pages captured on
 * 2026-09-17, trimmed to the elements the parser reads.
 */
const footer = (id: string, datetime = '2026-09-16T19:12:16+00:00') => `
<div class="tgme_widget_message_footer compact js-message_footer">
  <div class="tgme_widget_message_info short js-message_info">
    <span class="tgme_widget_message_views">4.02K</span><span class="copyonly"> views</span><span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/${id}"><time datetime="${datetime}" class="time">19:12</time></a></span>
  </div>
</div>`;

const wrap = (id: string, body: string, { cls = '', datetime }: { cls?: string; datetime?: string | null } = {}) => `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap ${cls} js-widget_message" data-post="${id}" data-view="x">
  <div class="tgme_widget_message_bubble">
    ${body}
    ${datetime === null ? '' : footer(id, datetime)}
  </div>
</div></div>`;

// A forwarded photo post: the photo wrap contains nested divs that cut the
// old lazy regex short, before the footer and its timestamp.
const FORWARDED_PHOTO = wrap('BellumActaNews/177066', `
<div class="tgme_widget_message_forwarded_from accent_color">Forwarded from&nbsp;<a class="tgme_widget_message_forwarded_from_name" href="https://t.me/DDGeopolitics/193490"><span dir="auto">DD Geopolitics <i class="emoji"><b>🇷🇺</b></i></span></a></div>
<div class="media_supported_cont"><a class="tgme_widget_message_photo_wrap 4992570324356369542" href="https://t.me/BellumActaNews/177066" style="width:800px;background-image:url('https://cdn1.telesco.pe/file/photo.jpg')">
  <div class="tgme_widget_message_photo" style="padding-top:99.875%"></div>
</a><div class="tgme_widget_message_text js-message_text" dir="auto"><i class="emoji"><b>🛸</b></i><i class="emoji"><b>🇺🇦</b></i><b>Russia&#39;s new drones (Geran-5) are changing the air war - FT</b><br/><i>What Western media say</i><br/><br/>Strikes on logistics hubs &amp; rail junctions.<blockquote>&quot;Around 60 percent.&quot;</blockquote></div></div>`);

// A reply: the quoted parent's text comes first and must not be taken.
const REPLY = wrap('BellumActaNews/177056', `
<a class="tgme_widget_message_reply user-color-default" href="https://t.me/BellumActaNews/177055"><i class="tgme_widget_message_reply_thumb" style="background-image:url('https://cdn1.telesco.pe/file/reply.jpg')"></i>
<div class="tgme_widget_message_author accent_color"><span class="tgme_widget_message_author_name" dir="auto">Bellum Acta</span></div>
<div class="tgme_widget_message_text js-message_reply_text" dir="auto">The parent post that is being quoted here</div></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">Afghanistan, Turkey Discuss Strengthening Security and Defense Cooperation</div>`);

// An album: the text is wrapped in a second js-message_text div.
const ALBUM_VIDEO = wrap('OSINTtechnical/100', `
<div class="tgme_widget_message_grouped_wrap"><div class="tgme_widget_message_grouped"><div class="tgme_widget_message_grouped_layer">
<a class="tgme_widget_message_video_player not_supported js-message_video_player" href="https://t.me/OSINTtechnical/99"><i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn1.telesco.pe/file/video.jpg')"></i>
<div class="tgme_widget_message_video_wrap" style="width:1920px;padding-top:56.25%"></div>
<time class="message_video_duration js-message_video_duration">0:29</time></a>
<a class="tgme_widget_message_photo_wrap grouped_media_wrap" style="background-image:url('https://cdn1.telesco.pe/file/second.jpg')"><div class="tgme_widget_message_photo grouped_media"></div></a>
</div></div></div><div class="tgme_widget_message_text js-message_text" dir="auto"><div class="tgme_widget_message_text js-message_text" dir="auto">Russian SU-25 RF-90958 crashed in Rostov Oblast<br/><br/><a href="https://t.me/osinttechnical">@osinttechnical</a></div></div>`);

// A video Telegram previews in place: the file sits in a <video src>, with
// an entity-encoded query string.
const PLAYABLE_VIDEO = wrap('OSINTdefender/20283', `
<a class="tgme_widget_message_video_player js-message_video_player" href="https://t.me/OSINTdefender/20283"><i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn4.telesco.pe/file/thumb.jpg')"></i>
<div class="tgme_widget_message_video_wrap" style="width:1280px;padding-top:56.25%"><video src="https://cdn4.telesco.pe/file/1a30ec3feb.mp4?token=abc&amp;x=1" class="tgme_widget_message_video js-message_video" width="100%" height="100%"></video></div>
<time class="message_video_duration js-message_video_duration">0:24</time></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">Missiles are flying over Riyadh tonight.</div>`);

// Same shape, but the file is not on Telegram's CDN.
const FOREIGN_VIDEO = wrap('OSINTdefender/20284', `
<a class="tgme_widget_message_video_player js-message_video_player" href="https://t.me/OSINTdefender/20284"><i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn4.telesco.pe/file/thumb2.jpg')"></i>
<div class="tgme_widget_message_video_wrap"><video src="https://evil.example/clip.mp4" class="tgme_widget_message_video js-message_video"></video></div></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">A video served from somewhere else entirely.</div>`);

const SERVICE = wrap('DDGeopolitics/193454', `
<div class="tgme_widget_message_text js-message_text" dir="auto"><a class="tgme_widget_message_author_name" href="https://t.me/DDGeopolitics"><span dir="auto">DD Geopolitics</span></a> pinned a photo</div>`,
{ cls: 'service_message' });

const UNDATED = wrap('x/1', `<div class="tgme_widget_message_text js-message_text" dir="auto">A post whose footer carries no timestamp at all</div>`, { datetime: null });

describe('parseChannelPage', () => {
  const page = `<html>${FORWARDED_PHOTO}${REPLY}${ALBUM_VIDEO}${PLAYABLE_VIDEO}${FOREIGN_VIDEO}${SERVICE}${UNDATED}</html>`;
  const posts = parseChannelPage(page, 'BellumActaNews');

  it('keeps real posts and drops service notices and undated posts', () => {
    expect(posts.map(p => p.id)).toEqual(['BellumActaNews/177066', 'BellumActaNews/177056', 'OSINTtechnical/100', 'OSINTdefender/20283', 'OSINTdefender/20284']);
  });

  it('takes the permalink and publish time from the post, even when media precedes the footer', () => {
    expect(posts[0].url).toBe('https://t.me/BellumActaNews/177066');
    expect(posts[0].publishedAt).toBe('2026-09-16T19:12:16.000Z');
  });

  it('reads the post’s own text, not the reply it quotes', () => {
    expect(posts[1].text).toBe('Afghanistan, Turkey Discuss Strengthening Security and Defense Cooperation');
    expect(posts[1].replyTo).toBe('https://t.me/BellumActaNews/177055');
  });

  it('reads album text through the doubled wrapper', () => {
    expect(posts[2].headline).toBe('Russian SU-25 RF-90958 crashed in Rostov Oblast');
  });

  it('decodes entities and keeps paragraph structure', () => {
    expect(posts[0].text).toContain("Russia's new drones (Geran-5) are changing the air war - FT");
    expect(posts[0].text).toContain('logistics hubs & rail junctions.');
    expect(posts[0].text).toContain('"Around 60 percent."');
    expect(posts[0].text).not.toMatch(/&#?\w+;/);
  });

  it('builds a clean headline and puts the rest in the summary', () => {
    expect(posts[0].headline).toBe("Russia's new drones (Geran-5) are changing the air war - FT");
    expect(posts[0].summary.startsWith('What Western media say')).toBe(true);
  });

  it('describes media, forwards and views', () => {
    expect(posts[0].media).toEqual({ kind: 'photo', thumb: 'https://cdn1.telesco.pe/file/photo.jpg', duration: null, video: null, count: 1 });
    expect(posts[0].forwardedFrom).toEqual({ name: 'DD Geopolitics', url: 'https://t.me/DDGeopolitics/193490' });
    expect(posts[0].views).toBe(4020);
    expect(posts[2].media).toEqual({ kind: 'video', thumb: 'https://cdn1.telesco.pe/file/video.jpg', duration: '0:29', video: null, count: 2 });
    expect(posts[1].media).toBeNull();
  });

  it('takes the playable file of a video Telegram previews in place', () => {
    expect(posts[3].media?.video).toBe('https://cdn4.telesco.pe/file/1a30ec3feb.mp4?token=abc&x=1');
    expect(posts[3].media?.duration).toBe('0:24');
  });

  it('leaves the file out when Telegram only offers it in the app, or it is not on Telegram’s CDN', () => {
    expect(posts[2].media?.video).toBeNull(); // "not_supported": too big to preview
    expect(posts[4].media?.video).toBeNull();
    expect(posts[4].media?.kind).toBe('video');
  });
});

describe('splitHeadline', () => {
  it('strips flags, emoji and decoration, and lifts the breaking label into a flag', () => {
    expect(splitHeadline('#BREAKING | 🇸🇪 — Sweden election too close to call\nMore to follow')).toEqual({
      headline: 'Sweden election too close to call', summary: 'More to follow', flag: 'BREAKING',
    });
  });

  it('drops the other house labels without flagging them', () => {
    expect(splitHeadline('— 🇮🇷 NEW: For the 200th consecutive night, sirens sounded').headline)
      .toBe('For the 200th consecutive night, sirens sounded');
  });

  it('skips lines that are only a label or a lone word', () => {
    const r = splitHeadline('📝ÚLTIMA HORA📝\nDnepropetrovsk\nStrikes reported on the city’s power grid overnight');
    expect(r.headline).toBe('Strikes reported on the city’s power grid overnight');
    expect(r.flag).toBe('BREAKING');
  });

  it('joins a speaker line to the quote beneath it', () => {
    expect(splitHeadline('Houthi Leader Abdul-Malik al-Houthi:\n\nWe will respond to any escalation.\n\nFull speech below').headline)
      .toBe('Houthi Leader Abdul-Malik al-Houthi: We will respond to any escalation.');
  });

  it('removes forwarding debris and unpaired guillemets', () => {
    expect(splitHeadline('Fwd from @ 📝«Cauldron near Volchansk📝').headline).toBe('Cauldron near Volchansk');
  });

  it('cuts a run-on first line at its first sentence', () => {
    const long = `The ministry said the talks would resume next week. ${'Further detail follows in a long paragraph. '.repeat(6)}`;
    const r = splitHeadline(long);
    expect(r.headline).toBe('The ministry said the talks would resume next week.');
    expect(r.summary.startsWith('Further detail')).toBe(true);
  });

  it('turns styled Unicode letters back into plain text', () => {
    expect(splitHeadline('𝗦𝘁𝗿𝗶𝗸𝗲 𝗼𝗻 𝘁𝗵𝗲 𝗽𝗼𝗿𝘁 confirmed').headline).toBe('Strike on the port confirmed');
  });
});

describe('stripSignOff', () => {
  it('drops the handles, menus and separators channels append', () => {
    expect(stripSignOff('Strikes hit the depot\n➖➖➖➖➖➖➖➖\n@BellumActaNews')).toBe('Strikes hit the depot');
    // Bellum Acta's real footer: an advertisement between two rules, then the handle.
    expect(stripSignOff('Strikes hit the depot\n➖➖➖➖➖➖➖\n💧 Rainbet.com the #1 Non-KYC Crypto Casino & Sportsbook @rainbetcom\n➖➖➖➖➖➖➖➖\n@BellumActaNews'))
      .toBe('Strikes hit the depot');
    expect(stripSignOff('Supply routes mapped\n#NATO #Russia #USA #Ukraine')).toBe('Supply routes mapped');
    expect(stripSignOff('Watch it live on TASS.\n🔴 @DDGeopolitics | Socials | Donate')).toBe('Watch it live on TASS.');
    expect(stripSignOff('Gerans on deployment\n👁@evropar — on the threshold of Europe’s death\n✉ VK | ✉ RuTube | ✉ OK | ✉ Zen\n💸Support us Original msg'))
      .toBe('Gerans on deployment');
  });

  it('keeps handles that are part of the report', () => {
    expect(stripSignOff('You can get the book on @ukr_leaks_analytics')).toBe('You can get the book on @ukr_leaks_analytics');
    expect(stripSignOff('@someone said the talks failed\nMore detail here')).toBe('@someone said the talks failed\nMore detail here');
  });
});

describe('text helpers', () => {
  it('decodes named, decimal and hex entities in one pass', () => {
    expect(decodeHtmlEntities('Russia&#39;s &quot;Geran&quot; &#x2014; 5&#33; &amp;lt;')).toBe('Russia\'s "Geran" — 5! &lt;');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeHtmlEntities('&bogus; &#0;')).toBe('&bogus; &#0;');
  });

  it('collapses whitespace but keeps paragraph breaks', () => {
    expect(htmlToText('One&nbsp;&nbsp;two<br/><br/><br/>three')).toBe('One two\n\nthree');
  });

  it('parses view counts as Telegram prints them', () => {
    expect(parseViews('4.02K')).toBe(4020);
    expect(parseViews('1.2M')).toBe(1_200_000);
    expect(parseViews('873')).toBe(873);
    expect(parseViews('n/a')).toBeNull();
  });

  it('fingerprints reposts identically despite emoji and links', () => {
    const base = 'Explosions reported near the Kherson rail junction';
    expect(fingerprint(`🇺🇦 ${base} https://t.me/x @someone`)).toBe(fingerprint(base));
    expect(fingerprint(base)).not.toBe(fingerprint('Explosions reported near the Odesa port'));
  });
});
