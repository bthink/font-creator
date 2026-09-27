import { getDb } from '../db';

export type GlyphSetEntry = {
  id: number;
  projectId: number;
  charValue: string;
  type: 'single' | 'ligature';
  componentChars: string | null;
  sortOrder: number;
};

type GlyphSetRow = {
  id: number;
  project_id: number;
  char_value: string;
  type: 'single' | 'ligature';
  component_chars: string | null;
  sort_order: number;
};

function toEntry(row: GlyphSetRow): GlyphSetEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    charValue: row.char_value,
    type: row.type,
    componentChars: row.component_chars,
    sortOrder: row.sort_order,
  };
}

export function addGlyphSetEntry(
  projectId: number,
  charValue: string,
  type: 'single' | 'ligature',
  componentChars?: string,
): GlyphSetEntry {
  const db = getDb();
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM glyph_set WHERE project_id = ?')
    .get(projectId) as { max_order: number };
  const result = db
    .prepare(
      'INSERT INTO glyph_set (project_id, char_value, type, component_chars, sort_order) VALUES (?, ?, ?, ?, ?)',
    )
    .run(projectId, charValue, type, componentChars ?? null, maxOrder.max_order + 1);
  const row = db
    .prepare('SELECT * FROM glyph_set WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as GlyphSetRow;
  return toEntry(row);
}

export function listGlyphSetEntries(projectId: number): GlyphSetEntry[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM glyph_set WHERE project_id = ? ORDER BY sort_order ASC')
    .all(projectId) as GlyphSetRow[];
  return rows.map(toEntry);
}

export function removeGlyphSetEntry(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM glyph_set WHERE id = ?').run(id);
}
