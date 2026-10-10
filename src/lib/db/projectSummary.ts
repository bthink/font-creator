import { getDb } from '../db';

export type ProjectSummary = {
  characters: number;
  approved: number;
  scans: number;
  builds: number;
};
export function getProjectSummary(projectId: number): ProjectSummary {
  return getDb()
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM glyph_set WHERE project_id = @id) AS characters,
    (SELECT COUNT(DISTINCT glyphs.glyph_set_id) FROM glyphs JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id WHERE glyph_set.project_id = @id AND glyphs.status = 'approved') AS approved,
    (SELECT COUNT(*) FROM scans WHERE project_id = @id) AS scans,
    (SELECT COUNT(*) FROM builds WHERE project_id = @id) AS builds`,
    )
    .get({ id: projectId }) as ProjectSummary;
}
