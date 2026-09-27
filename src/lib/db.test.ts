import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

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
});
