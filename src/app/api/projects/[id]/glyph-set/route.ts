import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { addGlyphSetEntry, listGlyphSetEntries } from '@/lib/db/glyphSets';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  return NextResponse.json(listGlyphSetEntries(projectId));
}

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
  const body = (await request.json()) as {
    charValue?: string;
    type?: 'single' | 'ligature';
    componentChars?: string;
  };
  if (!body.charValue || !body.type) {
    return NextResponse.json({ error: 'charValue and type are required' }, { status: 400 });
  }
  if (
    (body.type !== 'single' && body.type !== 'ligature') ||
    (body.type === 'single' && [...body.charValue].length !== 1) ||
    (body.type === 'ligature' && !body.componentChars)
  ) {
    return NextResponse.json(
      { error: 'Pojedynczy glif musi zawierać jeden znak, a ligatura znaki składowe.' },
      { status: 400 },
    );
  }
  const entry = addGlyphSetEntry(projectId, body.charValue, body.type, body.componentChars);
  return NextResponse.json(entry, { status: 201 });
}
