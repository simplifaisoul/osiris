import * as m0001 from './0001_maritime_baseline';
import * as m0002 from './0002_news_events';
import * as m0003 from './0003_sanctions_history';

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [m0001, m0002, m0003];
