import { NextResponse } from 'next/server';
import { removeGlyphSetEntry } from '@/lib/db/glyphSets';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ glyphId: string }> },
): Promise<NextResponse> {
  const { glyphId } = await params;
  removeGlyphSetEntry(Number(glyphId));
  return NextResponse.json({ ok: true });
}
