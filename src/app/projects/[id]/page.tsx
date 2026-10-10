import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { listBuilds } from '@/lib/db/builds';
import { listScans, listUploadedPageIndexes } from '@/lib/db/scans';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import { getProjectSummary } from '@/lib/db/projectSummary';
import { listCurrentGlyphsWithCharLabel } from '@/lib/db/glyphs';
import { ProjectWorkspace } from '@/components/ProjectWorkspace';

export const dynamic = 'force-dynamic';
export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const project = getProject(Number(id));
  if (!project) notFound();
  const summary = getProjectSummary(project.id);
  const template = getLatestTemplateVersion(project.id);
  const entries = listGlyphSetEntries(project.id);
  const templateReady =
    !!template?.gridConfig.glyphSetIds &&
    JSON.stringify(template.gridConfig.glyphSetIds) ===
      JSON.stringify(entries.map((entry) => entry.id));
  const pageCount = template ? Math.ceil(entries.length / (template.gridConfig.columns * template.gridConfig.rows)) : 1;
  const uploadedPageIndexes = template
    ? listUploadedPageIndexes(
        project.id,
        template.id,
        template.gridConfig.columns * template.gridConfig.rows,
      )
    : [];
  return (
    <ProjectWorkspace
      project={project}
      initialEntries={entries}
      initialBuilds={listBuilds(project.id)}
      scans={listScans(project.id)}
      summary={summary}
      hasTemplate={templateReady}
      pageCount={Math.max(1, pageCount)}
      uploadedPageIndexes={uploadedPageIndexes}
      initialGlyphs={listCurrentGlyphsWithCharLabel(project.id)}
      initialStep={step}
    />
  );
}
