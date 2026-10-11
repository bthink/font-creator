import { getDb } from '../db';

export type Scan = {
  id: number;
  projectId: number;
  templateVersionId: number;
  filePath: string;
  originalFilename: string | null;
  uploadedAt: string;
  alignmentStatus: 'pending' | 'aligned' | 'failed';
};

type ScanRow = {
  id: number;
  project_id: number;
  template_version_id: number;
  file_path: string;
  original_filename: string | null;
  uploaded_at: string;
  alignment_status: 'pending' | 'aligned' | 'failed';
};

function toScan(row: ScanRow): Scan {
  return {
    id: row.id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
    filePath: row.file_path,
    originalFilename: row.original_filename,
    uploadedAt: row.uploaded_at,
    alignmentStatus: row.alignment_status,
  };
}

export function createScan(
  projectId: number,
  templateVersionId: number,
  filePath: string,
  originalFilename?: string,
): Scan {
  const db = getDb();
  const result = db
    .prepare(
      'INSERT INTO scans (project_id, template_version_id, file_path, original_filename) VALUES (?, ?, ?, ?)',
    )
    .run(projectId, templateVersionId, filePath, originalFilename ?? null);
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(Number(result.lastInsertRowid)) as ScanRow;
  return toScan(row);
}

export function getScan(id: number): Scan | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined;
  return row ? toScan(row) : undefined;
}

export function deleteScan(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM scans WHERE id = ?').run(id);
}

export function updateScanAlignment(scanId: number, status: 'aligned' | 'failed'): void {
  const db = getDb();
  db.prepare('UPDATE scans SET alignment_status = ? WHERE id = ?').run(status, scanId);
}

export function listScans(projectId: number): Scan[] {
  const rows = getDb().prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY id DESC').all(projectId) as ScanRow[];
  return rows.map(toScan);
}

export function listUploadedPageIndexes(
  projectId: number,
  templateVersionId: number,
  cellsPerPage: number,
): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT CAST(glyph_set.sort_order / ? AS INTEGER) AS page_index
       FROM glyphs
       JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id
       JOIN scans ON scans.id = glyphs.scan_id
       WHERE scans.project_id = ? AND scans.template_version_id = ?
         AND scans.alignment_status = 'aligned'
       ORDER BY page_index ASC`,
    )
    .all(cellsPerPage, projectId, templateVersionId) as { page_index: number }[];
  return rows.map((row) => row.page_index);
}
