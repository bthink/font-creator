import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { approveCurrentGlyphs } from '@/lib/db/glyphs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || !getProject(projectId)) {
    return NextResponse.json({ error: 'Nie znaleziono projektu.' }, { status: 404 });
  }
  return NextResponse.json({ approved: approveCurrentGlyphs(projectId) });
}
