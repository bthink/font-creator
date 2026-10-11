import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? './data';

let instance: Database.Database | undefined;

function migrate(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'vertical_offset_override')) {
    db.exec('ALTER TABLE glyphs ADD COLUMN vertical_offset_override INTEGER');
  }
  if (!columns.some((column) => column.name === 'scale_override')) {
    db.exec('ALTER TABLE glyphs ADD COLUMN scale_override INTEGER');
  }
  const scanColumns = db.prepare('PRAGMA table_info(scans)').all() as { name: string }[];
  if (!scanColumns.some((column) => column.name === 'original_filename')) {
    db.exec('ALTER TABLE scans ADD COLUMN original_filename TEXT');
  }
}

export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  instance = new Database(path.join(DATA_DIR, 'font-creator.db'));
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(process.cwd(), 'src/lib/db/schema.sql'), 'utf-8');
  instance.exec(schema);
  migrate(instance);
  return instance;
}
