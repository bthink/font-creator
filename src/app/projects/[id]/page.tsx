import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { listBuilds } from '@/lib/db/builds';
import { GlyphSetEditor } from '@/components/GlyphSetEditor';
import { TemplateGenerator } from '@/components/TemplateGenerator';
import { FontBuildPanel } from '@/components/FontBuildPanel';
import { ScanUploader } from '@/components/ScanUploader';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) notFound();
  const entries = listGlyphSetEntries(project.id);
  const builds = listBuilds(project.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <GlyphSetEditor projectId={project.id} initialEntries={entries} />
      <TemplateGenerator projectId={project.id} />
      <ScanUploader projectId={project.id} />
      <FontBuildPanel projectId={project.id} initialBuilds={builds} />
    </main>
  );
}
