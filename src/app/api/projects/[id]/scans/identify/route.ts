import { getProject } from '@/lib/db/projects';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { identifyScanPage } from '@/lib/scanPageIdentity';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) return Response.json({ error: 'Nie znaleziono projektu.' }, { status: 404 });
  const template = getLatestTemplateVersion(project.id);
  const entries = listGlyphSetEntries(project.id);
  if (!template || JSON.stringify(template.gridConfig.glyphSetIds) !== JSON.stringify(entries.map((entry) => entry.id))) {
    return Response.json({ error: 'Najpierw pobierz aktualny szablon.' }, { status: 400 });
  }
  const file = (await request.formData()).get('file');
  if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 30 * 1024 * 1024) {
    return Response.json({ error: 'Wybierz PNG lub JPG do 30 MB.' }, { status: 400 });
  }
  try {
    const pageCount = Math.ceil(entries.length / (template.gridConfig.columns * template.gridConfig.rows));
    const pageIndex = await identifyScanPage(file, { projectId: project.id, templateVersionId: template.id }, pageCount);
    return Response.json({ pageIndex });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Nie udało się rozpoznać strony.' }, { status: 422 });
  }
}
