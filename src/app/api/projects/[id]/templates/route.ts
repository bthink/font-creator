import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { generateTemplatePdf } from '@/lib/pdf/generateTemplate';
import { createTemplateVersion, getLatestTemplateVersion } from '@/lib/db/templateVersions';

const DEFAULT_GRID = { columns: 5, rows: 6, cellSizePt: 90, markerSizePt: 12, codeFooterHeightPt: 72 };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const entries = listGlyphSetEntries(projectId);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'glyph set is empty' }, { status: 400 });
  }
  const grid = { ...DEFAULT_GRID, glyphSetIds: entries.map(entry => entry.id) };
  const latest = getLatestTemplateVersion(projectId);
  // Downloading the same layout again must preserve its uploaded pages.
  const version = latest && JSON.stringify(latest.gridConfig) === JSON.stringify(grid)
    ? latest
    : createTemplateVersion(projectId, grid);
  const bytes = await generateTemplatePdf(entries, grid, { projectId, templateVersionId: version.id });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="template.pdf"',
    },
  });
}
