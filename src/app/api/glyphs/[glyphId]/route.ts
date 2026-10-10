import { NextRequest, NextResponse } from 'next/server';
import { updateGlyphOverrides } from '@/lib/db/glyphs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ glyphId: string }> },
): Promise<NextResponse> {
  const { glyphId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ error: 'Nieprawidłowe dane.' }, { status: 400 });
  for (const field of ['advanceWidthOverride', 'leftBearingOverride']) {
    if (
      body[field] !== undefined &&
      (!Number.isInteger(body[field]) || body[field] < 0 || body[field] > 5000)
    )
      return NextResponse.json(
        { error: 'Szerokość musi być liczbą całkowitą od 0 do 5000.' },
        { status: 400 },
      );
  }
  if (
    body.verticalOffsetOverride !== undefined &&
    (!Number.isInteger(body.verticalOffsetOverride) ||
      body.verticalOffsetOverride < -150 ||
      body.verticalOffsetOverride > 150)
  )
    return NextResponse.json(
      { error: 'Pozycja w pionie musi być liczbą całkowitą od -150 do 150.' },
      { status: 400 },
    );
  if (
    body.scaleOverride !== undefined &&
    (!Number.isInteger(body.scaleOverride) ||
      body.scaleOverride < 50 ||
      body.scaleOverride > 200)
  )
    return NextResponse.json(
      { error: 'Rozmiar musi być liczbą całkowitą od 50 do 200.' },
      { status: 400 },
    );
  if (
    body.status !== undefined &&
    !['pending', 'reviewed', 'approved', 'failed'].includes(body.status)
  )
    return NextResponse.json(
      { error: 'Nieprawidłowy status glifu.' },
      { status: 400 },
    );
  const updated = updateGlyphOverrides(Number(glyphId), body);
  if (!updated)
    return NextResponse.json(
      { error: 'Nie znaleziono glifu.' },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
