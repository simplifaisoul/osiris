export const id = '0002_news_events';

export const sql = `
CREATE TABLE news_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  sentiment REAL,
  category TEXT,
  region TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX idx_news_ts ON news_events(ts);
CREATE INDEX idx_news_category_ts ON news_events(category, ts);
`;
