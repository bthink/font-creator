import { getDb } from '../db';

export type Glyph = {
  id: number;
  glyphSetId: number;
  scanId: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  leftBearingOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

type GlyphRow = {
  id: number;
  glyph_set_id: number;
  scan_id: number;
  svg_path: string | null;
  bbox_raw: string | null;
  advance_width_override: number | null;
  left_bearing_override: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

function toGlyph(row: GlyphRow): Glyph {
  return {
    id: row.id,
    glyphSetId: row.glyph_set_id,
    scanId: row.scan_id,
    svgPath: row.svg_path,
    bboxRaw: row.bbox_raw ? (JSON.parse(row.bbox_raw) as [number, number, number, number]) : null,
    advanceWidthOverride: row.advance_width_override,
    leftBearingOverride: row.left_bearing_override,
    status: row.status,
  };
}

export function createGlyph(
  glyphSetId: number,
  scanId: number,
  svgPath: string,
  bboxRaw: [number, number, number, number],
): Glyph {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO glyphs (glyph_set_id, scan_id, svg_path, bbox_raw) VALUES (?, ?, ?, ?)')
    .run(glyphSetId, scanId, svgPath, JSON.stringify(bboxRaw));
  const row = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(Number(result.lastInsertRowid)) as GlyphRow;
  return toGlyph(row);
}

export function listGlyphsByScan(scanId: number): Glyph[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM glyphs WHERE scan_id = ?').all(scanId) as GlyphRow[];
  return rows.map(toGlyph);
}

export type GlyphWithChar = Glyph & { charLabel: string };

type GlyphWithCharRow = GlyphRow & { char_label: string };

export function listGlyphsWithCharLabel(scanId: number): GlyphWithChar[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT glyphs.*, glyph_set.char_value AS char_label
       FROM glyphs
       JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id
       WHERE glyphs.scan_id = ?`,
    )
    .all(scanId) as GlyphWithCharRow[];
  return rows.map((row) => ({ ...toGlyph(row), charLabel: row.char_label }));
}

export function updateGlyphOverrides(
  glyphId: number,
  overrides: { advanceWidthOverride?: number; leftBearingOverride?: number; status?: Glyph['status'] },
): Glyph | undefined {
  const db = getDb();
  const current = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(glyphId) as GlyphRow | undefined;
  if (!current) return undefined;

  db.prepare(
    'UPDATE glyphs SET advance_width_override = ?, left_bearing_override = ?, status = ? WHERE id = ?',
  ).run(
    overrides.advanceWidthOverride ?? current.advance_width_override,
    overrides.leftBearingOverride ?? current.left_bearing_override,
    overrides.status ?? current.status,
    glyphId,
  );

  return toGlyph({
    ...current,
    advance_width_override: overrides.advanceWidthOverride ?? current.advance_width_override,
    left_bearing_override: overrides.leftBearingOverride ?? current.left_bearing_override,
    status: overrides.status ?? current.status,
  });
}
