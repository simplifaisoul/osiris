/**
 * OSIRIS OI: the words of a question, for matching sources on. Pure and
 * client-safe, so the research plan (which the scripted demo model uses in
 * the browser too) can share it with the server's feed reader.
 */

const STOP = new Set(`
  the and for are but not you all any can had her was one our out has have his how its may new now old see two way who
  did get let say she too use will would could should what when where which while with without within into onto from
  this that these those than then them they their there here about above after again against before below between
  both during each few more most other over same some such only own under until very just also been being does doing
  done make made next last year years month months week weeks day days time end happen happens happening likely chance
  probability predict prediction forecast question whether does dont isnt arent wont cant per via upon among across
`.split(/\s+/).filter(Boolean));

/** The words of a question worth matching headlines on. */
export function terms(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const raw of t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u)) {
      if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
      out.add(raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
      if (out.size >= 40) break;
    }
  }
  return [...out];
}

/** Whether a word starts somewhere in a text. */
export function hit(hay: string, term: string): boolean {
  const i = hay.indexOf(term);
  if (i < 0) return false;
  // A word start, so "ran" does not match "Iran" and "oil" does not match "turmoil".
  return i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1]);
}
