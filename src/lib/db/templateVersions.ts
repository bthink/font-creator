import { getDb } from '../db';
import type { GridConfig } from '@/lib/pdf/generateTemplate';

export type TemplateVersion = {
  id: number;
  projectId: number;
  gridConfig: GridConfig;
  createdAt: string;
};

type TemplateVersionRow = {
  id: number;
  project_id: number;
  grid_config: string;
  created_at: string;
};

function toTemplateVersion(row: TemplateVersionRow): TemplateVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    gridConfig: JSON.parse(row.grid_config) as GridConfig,
    createdAt: row.created_at,
  };
}

export function createTemplateVersion(projectId: number, grid: GridConfig): TemplateVersion {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO template_versions (project_id, grid_config) VALUES (?, ?)')
    .run(projectId, JSON.stringify(grid));
  const row = db
    .prepare('SELECT * FROM template_versions WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as TemplateVersionRow;
  return toTemplateVersion(row);
}

export function getLatestTemplateVersion(projectId: number): TemplateVersion | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM template_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as TemplateVersionRow | undefined;
  return row ? toTemplateVersion(row) : undefined;
}
