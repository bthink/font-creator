import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deleteScan, getScan } from '@/lib/db/scans';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scanId: string }> },
): Promise<NextResponse> {
  const { id, scanId } = await params;
  const scan = getScan(Number(scanId));
  if (!scan || scan.projectId !== Number(id)) {
    return NextResponse.json({ error: 'scan not found' }, { status: 404 });
  }

  const glyphOutputDir = path.join(path.dirname(scan.filePath), `glyphs-${scan.id}`);
  await Promise.all([
    fs.rm(scan.filePath, { force: true }),
    fs.rm(glyphOutputDir, { recursive: true, force: true }),
  ]);

  deleteScan(scan.id);
  return NextResponse.json({ ok: true });
}
