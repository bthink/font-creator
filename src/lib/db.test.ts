import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

describe('getDb', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test';
  });

  afterEach(() => {
    fs.rmSync('./data-test', { recursive: true, force: true });
  });

  it('creates a database file and returns a working connection', async () => {
    const { getDb } = await import('./db');
    const db = getDb();
    const result = db.prepare('SELECT 1 AS value').get() as { value: number };
    expect(result.value).toBe(1);
  });

  it('adds vertical_offset_override to a pre-existing glyphs table that lacks it', async () => {
    fs.mkdirSync('./data-test', { recursive: true });
    const legacyDb = new Database(path.join('./data-test', 'font-creator.db'));
    legacyDb.exec(`
      CREATE TABLE glyphs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        glyph_set_id INTEGER NOT NULL,
        scan_id INTEGER NOT NULL,
        svg_path TEXT,
        bbox_raw TEXT,
        advance_width_override INTEGER,
        left_bearing_override INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    legacyDb.close();

    const { getDb } = await import('./db');
    const db = getDb();
    const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'vertical_offset_override')).toBe(true);
  });
});
