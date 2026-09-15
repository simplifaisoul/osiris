import { beforeEach, describe, expect, it } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from './client';

beforeEach(() => {
  resetDbForTests();
});

describe('getDb', () => {
  it('applies all migrations and records them', () => {
    const db = getDb();

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining(['_migrations', 'maritime_snapshots', 'news_events', 'sanctions_history'])
    );

    const applied = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(
      (row) => row.id
    );
    expect(applied).toEqual(['0001_maritime_baseline', '0002_news_events', '0003_sanctions_history']);
  });

  it('does not re-apply migrations on a second getDb() call', () => {
    getDb();
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as n FROM _migrations').get() as { n: number }).n;
    expect(count).toBe(3);
  });

  it('reuses the same connection across calls', () => {
    expect(getDb()).toBe(getDb());
  });
});
