import { NextRequest, NextResponse } from 'next/server';
import { addGlyphSetEntry, listGlyphSetEntries } from '@/lib/db/glyphSets';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return NextResponse.json(listGlyphSetEntries(Number(id)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json()) as {
    charValue?: string;
    type?: 'single' | 'ligature';
    componentChars?: string;
  };
  if (!body.charValue || !body.type) {
    return NextResponse.json({ error: 'charValue and type are required' }, { status: 400 });
  }
  const entry = addGlyphSetEntry(Number(id), body.charValue, body.type, body.componentChars);
  return NextResponse.json(entry, { status: 201 });
}
