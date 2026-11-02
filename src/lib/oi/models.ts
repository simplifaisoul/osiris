/**
 * OSIRIS OI: the model list, organised for choosing.
 *
 * A provider's listing is long and flat: OpenAI's holds every dated snapshot
 * of every family next to its alias. This sorts it into what a reader
 * chooses between: the recommended models first, then each family newest
 * first (for OpenAI: GPT-5.x, GPT-4.1, GPT-4o, the o-series reasoning
 * models, then legacy), with a one-line hint for each, and the dated
 * snapshots of a listed alias tucked away until asked for or searched.
 * Browser-safe: no server code.
 */
import type { ProviderId } from './providers';

export interface ModelOption {
  id: string;
  name: string;
  /** What it is good for, in a few words. */
  hint: string;
  reasoning: boolean;
  recommended: boolean;
  /** The provider's default for OI. */
  isDefault: boolean;
}

export interface ModelGroup {
  key: string;
  label: string;
  models: ModelOption[];
}

/** A dated snapshot's alias: gpt-4o-2024-08-06 → gpt-4o, gpt-4-0613 → gpt-4. */
export const aliasOf = (id: string) => id.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/, '');

const bare = (id: string) => id.replace(/^openai\//, '');

/** OpenAI's reasoning models think before they answer: the o-series and GPT-5 (but not its chat-tuned variant). */
export function isReasoning(provider: ProviderId, id: string): boolean {
  const m = bare(id).toLowerCase();
  if (provider === 'openai' || provider === 'openrouter') {
    if (/^o\d/.test(m)) return true;
    if (/^gpt-5/.test(m)) return !/chat/.test(m);
  }
  if (provider === 'deepseek') return /reasoner/.test(m);
  return /thinking|reasoner|(^|[-/])r1\b/.test(m);
}

interface Family { key: string; label: string; rank: number }

/** An OpenAI model's family, ranked newest and most useful first; legacy last. */
function openaiFamily(id: string): Family {
  const m = id.toLowerCase();
  if (/^chatgpt-4o/.test(m)) return { key: 'gpt-4o', label: 'GPT-4o', rank: 400 };
  if (/^o\d/.test(m)) return { key: 'o', label: 'o-series · reasoning', rank: 300 };
  const g = /^gpt-(\d+)(?:\.(\d+))?(o)?/.exec(m);
  if (g) {
    const major = Number(g[1]);
    const minor = Number(g[2] ?? 0);
    if (g[3]) return { key: `gpt-${major}o`, label: `GPT-${major}o`, rank: 400 - major };
    if (major < 4 || (major === 4 && !g[2])) return { key: 'legacy', label: 'Legacy', rank: 900 };
    const v = g[2] ? `${major}.${minor}` : `${major}`;
    // Newer versions first: GPT-5.2, GPT-5.1, GPT-5 … GPT-4.1, then the o-series.
    return { key: `gpt-${v}`, label: `GPT-${v}`, rank: 100 - major - minor / 100 };
  }
  return { key: 'other', label: 'Other', rank: 800 };
}

/** A model's hint, from the conventions of its name. */
export function modelHint(provider: ProviderId, id: string): string {
  const m = bare(id).toLowerCase();
  if (provider === 'openai') {
    if (/^chatgpt-|chat-latest/.test(m)) return 'Chat-tuned, as in ChatGPT';
    if (/^o\d/.test(m)) {
      if (/nano|mini/.test(m)) return 'Reasoning · fast, low cost';
      return 'Deep reasoning · slower, higher cost';
    }
    const fam = openaiFamily(m);
    if (fam.key === 'legacy') return 'Older model';
    if (/nano/.test(m)) return 'Fastest · lowest cost';
    if (/mini/.test(m)) return isReasoning(provider, m) ? 'Reasons first · fast, good value' : 'Fast · low cost';
    if (/^gpt-5/.test(m)) return 'Most capable · reasons first';
    if (/^gpt-4\.1/.test(m)) return 'Long context · answers directly';
    if (/^gpt-4o/.test(m)) return 'Versatile · answers directly';
    return '';
  }
  if (/opus|ultra|-max\b|large|pro\b|grok-4(?!.*mini)/.test(m)) return 'Most capable · higher cost';
  if (/haiku|nano|lite|mini|small|turbo|instant|8b|flash/.test(m)) return 'Fast · low cost';
  if (/sonnet|medium|plus|versatile|70b/.test(m)) return 'Balanced';
  if (isReasoning(provider, m)) return 'Reasoning · slower';
  return '';
}

/**
 * The listing in groups: Recommended first (the provider's suggested models,
 * in order), then families. A dated snapshot whose alias is also listed is
 * left out unless `snapshots` is set or the query names it; the selected
 * model always shows. Returns how many snapshots were left out.
 */
export function organizeModels(
  provider: ProviderId,
  models: { id: string; name: string }[],
  opts: { suggested: string[]; defaultModel: string; selected: string; query?: string; snapshots?: boolean },
): { groups: ModelGroup[]; hidden: number } {
  const q = (opts.query ?? '').trim().toLowerCase();
  const ids = new Set(models.map(m => m.id));
  const seen = new Set<string>();
  const list = models.filter(m => !seen.has(m.id) && seen.add(m.id));
  if (opts.selected && !ids.has(opts.selected)) list.unshift({ id: opts.selected, name: opts.selected });

  const option = (m: { id: string; name: string }): ModelOption => ({
    id: m.id,
    name: m.name && m.name !== m.id ? m.name : m.id,
    hint: modelHint(provider, m.id),
    reasoning: isReasoning(provider, m.id),
    recommended: opts.suggested.includes(m.id),
    isDefault: m.id === opts.defaultModel,
  });

  let hidden = 0;
  const shown: ModelOption[] = [];
  for (const m of list) {
    const o = option(m);
    if (q && ![o.id, o.name, o.hint, o.reasoning ? 'reasoning' : ''].some(s => s.toLowerCase().includes(q))) continue;
    const alias = aliasOf(m.id);
    const snapshot = alias !== m.id && ids.has(alias);
    // A search shows a snapshot only when it names the date ("2024-08"), not for a word its alias matches too.
    const named = q && !alias.toLowerCase().includes(q) && m.id.toLowerCase().includes(q);
    if (snapshot && !opts.snapshots && !named && m.id !== opts.selected) { hidden++; continue; }
    shown.push(o);
  }

  const rec = opts.suggested.map(id => shown.find(o => o.id === id)).filter((o): o is ModelOption => !!o);
  const rest = shown.filter(o => !o.recommended);
  const groups: ModelGroup[] = rec.length ? [{ key: 'recommended', label: 'Recommended', models: rec }] : [];

  if (provider === 'openai') {
    const byFamily = new Map<string, { fam: Family; models: ModelOption[] }>();
    for (const o of rest) {
      const fam = openaiFamily(o.id);
      const g = byFamily.get(fam.key) ?? { fam, models: [] };
      g.models.push(o);
      byFamily.set(fam.key, g);
    }
    const order = (o: ModelOption) => (/nano/.test(o.id) ? 2 : /mini/.test(o.id) ? 1 : 0);
    for (const { fam, models: ms } of [...byFamily.values()].sort((a, b) => a.fam.rank - b.fam.rank)) {
      // Within a family: the flagship, then mini, then nano; aliases before their snapshots.
      ms.sort((a, b) => order(a) - order(b) || aliasOf(a.id).localeCompare(aliasOf(b.id)) || a.id.length - b.id.length || a.id.localeCompare(b.id));
      groups.push({ key: fam.key, label: fam.label, models: ms });
    }
  } else if (rest.length) {
    groups.push({ key: 'all', label: rec.length ? 'More models' : 'Models', models: rest });
  }
  return { groups, hidden };
}
