import fs from 'node:fs/promises';
import path from 'node:path';
import { getScan } from '@/lib/db/scans';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; scanId: string }> },
) {
  const { id, scanId } = await params;
  const scan = getScan(Number(scanId));
  if (!scan || scan.projectId !== Number(id)) {
    return Response.json({ error: 'Nie znaleziono skanu.' }, { status: 404 });
  }
  try {
    const base = await fs.realpath(
      /* turbopackIgnore: true */ process.env.DATA_DIR ?? './data',
    );
    const file = await fs.realpath(scan.filePath);
    if (!file.startsWith(base + path.sep)) {
      return Response.json({ error: 'Nieprawidłowa ścieżka skanu.' }, { status: 403 });
    }
    return new Response(await fs.readFile(file), {
      headers: {
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return Response.json({ error: 'Plik skanu jest niedostępny.' }, { status: 404 });
  }
}
