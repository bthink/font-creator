import { getDb } from '../db';

export type Build = {
  id: number;
  projectId: number;
  createdAt: string;
  otfPath: string | null;
  ttfPath: string | null;
  fontMetrics: Record<string, unknown> | null;
};

type BuildRow = {
  id: number;
  project_id: number;
  created_at: string;
  otf_path: string | null;
  ttf_path: string | null;
  font_metrics: string | null;
};

function toBuild(row: BuildRow): Build {
  return {
    id: row.id,
    projectId: row.project_id,
    createdAt: row.created_at,
    otfPath: row.otf_path,
    ttfPath: row.ttf_path,
    fontMetrics: row.font_metrics ? (JSON.parse(row.font_metrics) as Record<string, unknown>) : null,
  };
}

export function createBuild(
  projectId: number,
  otfPath: string,
  ttfPath: string,
  fontMetrics: Record<string, unknown>,
): Build {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO builds (project_id, otf_path, ttf_path, font_metrics) VALUES (?, ?, ?, ?)')
    .run(projectId, otfPath, ttfPath, JSON.stringify(fontMetrics));
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(Number(result.lastInsertRowid)) as BuildRow;
  return toBuild(row);
}

export function listBuilds(projectId: number): Build[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM builds WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as BuildRow[];
  return rows.map(toBuild);
}
