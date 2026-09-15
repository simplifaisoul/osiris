import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { migrations } from './migrations';

const globalForDb = globalThis as unknown as {
  osirisDb: Database.Database | undefined;
};

function resolveDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'data', 'osiris.db');
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((row) => row.id)
  );

  const insertMigration = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec(migration.sql);
    insertMigration.run(migration.id, Date.now());
  }
}

function createDb(): Database.Database {
  const dbPath = resolveDbPath();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

/** Singleton connection, cached on globalThis so Next.js dev hot-reload
    doesn't open a second handle onto the same file. */
export function getDb(): Database.Database {
  if (!globalForDb.osirisDb) {
    globalForDb.osirisDb = createDb();
  }
  return globalForDb.osirisDb;
}

/** Test seam — closes the current connection so the next getDb() call
    rebuilds it from scratch. Pair with DB_PATH=':memory:' in tests. */
export function resetDbForTests(): void {
  globalForDb.osirisDb?.close();
  globalForDb.osirisDb = undefined;
}
