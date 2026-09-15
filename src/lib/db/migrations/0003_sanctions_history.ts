export const id = '0003_sanctions_history';

export const sql = `
CREATE TABLE sanctions_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  trade_volume REAL,
  domain_active INTEGER NOT NULL,
  exposure_score REAL NOT NULL
);
CREATE INDEX idx_sanctions_entity_ts ON sanctions_history(entity_id, ts);
`;
