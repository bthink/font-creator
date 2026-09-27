import { NextRequest, NextResponse } from 'next/server';
import { updateGlyphOverrides } from '@/lib/db/glyphs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ glyphId: string }> },
): Promise<NextResponse> {
  const { glyphId } = await params;
  const body = (await request.json()) as {
    advanceWidthOverride?: number;
    leftBearingOverride?: number;
    status?: 'pending' | 'reviewed' | 'approved' | 'failed';
  };

  const updated = updateGlyphOverrides(Number(glyphId), body);
  if (!updated) {
    return NextResponse.json({ error: 'glyph not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
