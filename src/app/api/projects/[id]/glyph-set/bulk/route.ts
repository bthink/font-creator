import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { addGlyphSetEntriesBulk } from '@/lib/db/glyphSets';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const body = (await request.json()) as { charValues?: unknown };
  if (!Array.isArray(body.charValues) || body.charValues.length === 0) {
    return NextResponse.json({ error: 'charValues must be a non-empty array' }, { status: 400 });
  }
  const added = addGlyphSetEntriesBulk(projectId, body.charValues as string[]);
  return NextResponse.json({ added }, { status: 201 });
}
