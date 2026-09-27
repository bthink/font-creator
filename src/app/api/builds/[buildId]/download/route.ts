import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getBuild } from '@/lib/db/builds';

const DATA_DIR = process.env.DATA_DIR ?? './data';

// Defends against path traversal: the resolved target must live inside the
// resolved DATA_DIR. The trailing separator on the base prevents a sibling like
// "data-evil" from matching the "data" prefix.
function isContained(targetPath: string): boolean {
  const base = path.resolve(DATA_DIR);
  const resolved = path.resolve(targetPath);
  return resolved === base || resolved.startsWith(base + path.sep);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildId: string }> },
): Promise<NextResponse> {
  const { buildId } = await params;
  const format = new URL(request.url).searchParams.get('format') ?? 'otf';
  const build = getBuild(Number(buildId));

  if (!build) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const filePath = format === 'ttf' ? build.ttfPath : build.otfPath;

  if (!filePath) {
    return NextResponse.json(
      { error: 'font file not available for this build' },
      { status: 400 },
    );
  }

  if (!isContained(filePath)) {
    return NextResponse.json({ error: 'invalid font file path' }, { status: 403 });
  }

  try {
    const bytes = await fs.readFile(filePath);
    const contentType = format === 'ttf' ? 'font/ttf' : 'font/otf';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filePath.split('/').pop()}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'failed to read font file' }, { status: 500 });
  }
}
