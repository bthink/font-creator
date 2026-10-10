import fs from 'node:fs/promises';
import path from 'node:path';
import { getGlyph } from '@/lib/db/glyphs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ glyphId: string }> },
) {
  const { glyphId } = await params;
  const glyph = getGlyph(Number(glyphId));
  if (!glyph?.svgPath)
    return Response.json({ error: 'Brak podglądu glifu.' }, { status: 404 });
  try {
    const base = await fs.realpath(
      /* turbopackIgnore: true */ process.env.DATA_DIR ?? './data',
    );
    const file = await fs.realpath(glyph.svgPath);
    if (!file.startsWith(base + path.sep))
      return Response.json(
        { error: 'Nieprawidłowa ścieżka glifu.' },
        { status: 403 },
      );
    let svg = await fs.readFile(file, 'utf8');
    if (glyph.bboxRaw) {
      const [x, y, width, height] = glyph.bboxRaw;
      // Potrace uses scan pixels for its viewBox. Crop only the viewport, preserving the traced paths.
      if (
        [x, y, width, height].every(Number.isFinite) &&
        width > 0 &&
        height > 0
      ) {
        svg = svg.replace(/<svg\b[^>]*>/, (root) =>
          root
            .replace(/\s(?:viewBox|width|height)="[^"]*"/g, '')
            .replace(
              />$/,
              ` viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">`,
            ),
        );
      }
    }
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return Response.json(
      { error: 'Plik glifu jest niedostępny.' },
      { status: 404 },
    );
  }
}
