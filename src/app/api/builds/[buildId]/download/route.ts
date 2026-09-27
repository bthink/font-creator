import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getBuild } from '@/lib/db/builds';

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
