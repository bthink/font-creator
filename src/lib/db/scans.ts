import { getDb } from '../db';

export type Scan = {
  id: number;
  projectId: number;
  templateVersionId: number;
  filePath: string;
  uploadedAt: string;
  alignmentStatus: 'pending' | 'aligned' | 'failed';
};

type ScanRow = {
  id: number;
  project_id: number;
  template_version_id: number;
  file_path: string;
  uploaded_at: string;
  alignment_status: 'pending' | 'aligned' | 'failed';
};

function toScan(row: ScanRow): Scan {
  return {
    id: row.id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
    filePath: row.file_path,
    uploadedAt: row.uploaded_at,
    alignmentStatus: row.alignment_status,
  };
}

export function createScan(projectId: number, templateVersionId: number, filePath: string): Scan {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO scans (project_id, template_version_id, file_path) VALUES (?, ?, ?)')
    .run(projectId, templateVersionId, filePath);
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(Number(result.lastInsertRowid)) as ScanRow;
  return toScan(row);
}

export function updateScanAlignment(scanId: number, status: 'aligned' | 'failed'): void {
  const db = getDb();
  db.prepare('UPDATE scans SET alignment_status = ? WHERE id = ?').run(status, scanId);
}
