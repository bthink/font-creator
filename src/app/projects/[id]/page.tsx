import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { listBuilds } from '@/lib/db/builds';
import { listScans } from '@/lib/db/scans';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import { getProjectSummary } from '@/lib/db/projectSummary';
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
  return (
    <ProjectWorkspace
      project={project}
      initialEntries={entries}
      initialBuilds={listBuilds(project.id)}
      scans={listScans(project.id)}
      summary={summary}
      hasTemplate={templateReady}
      initialStep={step}
    />
  );
}
