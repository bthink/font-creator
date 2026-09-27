import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { listGlyphsByScan } from '@/lib/db/glyphs';
import { getScan } from '@/lib/db/scans';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const scanId = url.searchParams.get('scanId');
  if (!scanId) {
    return NextResponse.json({ error: 'scanId query param is required' }, { status: 400 });
  }

  const scan = getScan(Number(scanId));
  if (!scan || scan.projectId !== projectId) {
    return NextResponse.json({ error: 'scan not found' }, { status: 404 });
  }

  return NextResponse.json(listGlyphsByScan(Number(scanId)));
}
