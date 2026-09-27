import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? './data';

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  instance = new Database(path.join(DATA_DIR, 'font-creator.db'));
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}
