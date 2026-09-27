import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { GlyphSetEditor } from '@/components/GlyphSetEditor';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) notFound();
  const entries = listGlyphSetEntries(project.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <GlyphSetEditor projectId={project.id} initialEntries={entries} />
    </main>
  );
}
