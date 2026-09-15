export const id = '0001_maritime_baseline';

export const sql = `
CREATE TABLE maritime_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chokepoint_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ship_count INTEGER NOT NULL,
  risk_level TEXT NOT NULL
);
CREATE INDEX idx_maritime_chokepoint_ts ON maritime_snapshots(chokepoint_id, ts);
`;
