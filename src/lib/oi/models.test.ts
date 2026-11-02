import { describe, it, expect } from 'vitest';
import { aliasOf, isReasoning, modelHint, organizeModels } from './models';

const OPENAI = [
  'gpt-4o-mini', 'gpt-4o-2024-08-06', 'gpt-4o', 'gpt-4o-mini-2024-07-18', 'chatgpt-4o-latest',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4.1-2025-04-14',
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest', 'gpt-5-2025-08-07', 'gpt-5.1', 'gpt-5.1-mini',
  'o1', 'o3', 'o3-mini', 'o4-mini', 'o1-2024-12-17',
  'gpt-4', 'gpt-4-0613', 'gpt-4-turbo', 'gpt-3.5-turbo',
].map(id => ({ id, name: id }));

const opts = { suggested: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'], defaultModel: 'gpt-5-mini', selected: 'gpt-5-mini' };

describe('organizeModels', () => {
  it('puts the recommended models first, then each OpenAI family newest first, legacy last', () => {
    const { groups } = organizeModels('openai', OPENAI, opts);
    expect(groups.map(g => g.label)).toEqual(['Recommended', 'GPT-5.1', 'GPT-5', 'GPT-4.1', 'o-series · reasoning', 'GPT-4o', 'Legacy']);
    expect(groups[0].models.map(m => m.id)).toEqual(['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini']);
    expect(groups[0].models[0].isDefault).toBe(true);
    // A recommended model is not listed twice.
    expect(groups.find(g => g.label === 'GPT-5')!.models.map(m => m.id)).toEqual(['gpt-5-chat-latest', 'gpt-5-nano']);
    expect(groups.find(g => g.label === 'Legacy')!.models.map(m => m.id)).toEqual(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']);
  });

  it('tucks away dated snapshots of a listed alias until asked for, or searched', () => {
    const plain = organizeModels('openai', OPENAI, opts);
    const all = plain.groups.flatMap(g => g.models.map(m => m.id));
    expect(all).not.toContain('gpt-4o-2024-08-06');
    expect(plain.hidden).toBe(6);
    const shown = organizeModels('openai', OPENAI, { ...opts, snapshots: true });
    expect(shown.hidden).toBe(0);
    expect(shown.groups.flatMap(g => g.models.map(m => m.id))).toContain('gpt-4o-2024-08-06');
    const searched = organizeModels('openai', OPENAI, { ...opts, query: '2024-08' });
    expect(searched.groups.flatMap(g => g.models.map(m => m.id))).toEqual(['gpt-4o-2024-08-06']);
    // A word the alias matches too does not bring its snapshots back.
    const word = organizeModels('openai', OPENAI, { ...opts, query: 'mini' }).groups.flatMap(g => g.models.map(m => m.id));
    expect(word).toContain('gpt-4o-mini');
    expect(word).not.toContain('gpt-4o-mini-2024-07-18');
  });

  it('keeps the selected model even when it is a snapshot or not listed', () => {
    const snap = organizeModels('openai', OPENAI, { ...opts, selected: 'gpt-4-0613' });
    expect(snap.groups.flatMap(g => g.models.map(m => m.id))).toContain('gpt-4-0613');
    const custom = organizeModels('openai', OPENAI, { ...opts, selected: 'my-fine-tune' });
    expect(custom.groups.flatMap(g => g.models.map(m => m.id))).toContain('my-fine-tune');
  });

  it('finds reasoning models by the word', () => {
    const { groups } = organizeModels('openai', OPENAI, { ...opts, query: 'reasoning' });
    const ids = groups.flatMap(g => g.models.map(m => m.id));
    expect(ids).toContain('o3');
    expect(ids).toContain('gpt-5-mini');
    expect(ids).not.toContain('gpt-4o');
    expect(ids).not.toContain('gpt-5-chat-latest');
  });

  it('lists another provider as recommended, then the rest', () => {
    const { groups } = organizeModels('anthropic', [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }, { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }, { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' },
    ], { suggested: ['claude-haiku-4-5-20251001'], defaultModel: 'claude-haiku-4-5-20251001', selected: 'claude-haiku-4-5-20251001' });
    expect(groups.map(g => g.label)).toEqual(['Recommended', 'More models']);
    // A dated id with no alias listed is a model in its own right.
    expect(groups[1].models.map(m => m.id)).toEqual(['claude-opus-5-5', 'claude-3-haiku-20240307']);
    expect(groups[1].models[0].name).toBe('Claude Opus 5.5');
  });
});

describe('model hints', () => {
  it('reads what a model is for from its name', () => {
    expect(modelHint('openai', 'gpt-5-nano')).toMatch(/lowest cost/);
    expect(modelHint('openai', 'gpt-5-mini')).toMatch(/Reasons first/);
    expect(modelHint('openai', 'gpt-4.1-mini')).toBe('Fast · low cost');
    expect(modelHint('openai', 'o3')).toMatch(/Deep reasoning/);
    expect(modelHint('openai', 'o4-mini')).toMatch(/Reasoning · fast/);
    expect(modelHint('openai', 'gpt-3.5-turbo')).toBe('Older model');
    expect(modelHint('anthropic', 'claude-opus-5-5')).toMatch(/Most capable/);
    expect(modelHint('google', 'gemini-2.5-flash')).toMatch(/Fast/);
  });

  it('knows the reasoning models and the aliases of snapshots', () => {
    expect(isReasoning('openai', 'o3-mini')).toBe(true);
    expect(isReasoning('openai', 'gpt-5-chat-latest')).toBe(false);
    expect(isReasoning('openai', 'gpt-4.1')).toBe(false);
    expect(isReasoning('deepseek', 'deepseek-reasoner')).toBe(true);
    expect(aliasOf('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
    expect(aliasOf('gpt-4-0613')).toBe('gpt-4');
    expect(aliasOf('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
  });
});
