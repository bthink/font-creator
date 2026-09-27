import { getDb } from '../db';

export type Project = {
  id: number;
  name: string;
  createdAt: string;
  status: 'active' | 'archived';
};

type ProjectRow = {
  id: number;
  name: string;
  created_at: string;
  status: 'active' | 'archived';
};

function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, createdAt: row.created_at, status: row.status };
}

export function createProject(name: string): Project {
  const db = getDb();
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
  return getProject(Number(result.lastInsertRowid)) as Project;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: number): Project | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}
