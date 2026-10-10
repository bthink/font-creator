import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { getScan } from '@/lib/db/scans';
import { listGlyphsWithCharLabel } from '@/lib/db/glyphs';
import { GlyphReviewGrid } from '@/components/GlyphReviewGrid';
import { Icon } from '@/components/Icon';
export const dynamic = 'force-dynamic';
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scanId?: string }>;
}) {
  const { id } = await params;
  const { scanId } = await searchParams;
  const project = getProject(Number(id));
  const scan = scanId ? getScan(Number(scanId)) : undefined;
  if (!project || !scan || scan.projectId !== project.id) notFound();
  return (
    <main id="main-content" className="page">
      <Link href={`/projects/${project.id}?step=3`} className="back-link">
        <Icon name="back" /> {project.name}
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SKAN #{scan.id} / KOREKTA GLIFÓW</p>
          <h1>
            Liczy się każdy detal<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            Sprawdź swoje zeskanowane litery. Ustaw szerokość i zatwierdź każdą
            z nich.
          </p>
        </div>
      </div>
      <GlyphReviewGrid glyphs={listGlyphsWithCharLabel(scan.id)} />
      <div className="review-bottom">
        <Link
          href={`/projects/${project.id}?step=4`}
          className="button primary"
        >
          Przejdź do budowy fontu <Icon name="arrow" />
        </Link>
      </div>
    </main>
  );
}
