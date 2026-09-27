import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphsWithCharLabel } from '@/lib/db/glyphs';
import { GlyphReviewGrid } from '@/components/GlyphReviewGrid';

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scanId?: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const { scanId } = await searchParams;

  const project = getProject(Number(id));
  if (!project || !scanId) notFound();

  const glyphs = listGlyphsWithCharLabel(Number(scanId));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Review glyphs — {project.name}</h1>
      <GlyphReviewGrid glyphs={glyphs} />
    </main>
  );
}
