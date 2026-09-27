import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/db/projects';
import { listApprovedGlyphsForBuild } from '@/lib/db/glyphs';
import { createBuild, listBuilds } from '@/lib/db/builds';
import { runPythonTool } from '@/lib/python/runPython';
import { TEMPLATE_DPI } from '@/lib/pdf/generateTemplate';

const DATA_DIR = process.env.DATA_DIR ?? './data';

// 1 point = UNITS_PER_EM / 72 font units, and 1 pixel at TEMPLATE_DPI = 72/DPI
// points, so px -> font units = UNITS_PER_EM / DPI. UNITS_PER_EM (1000) mirrors
// python/src/font_creator_tools/build_font.py; keep them in sync.
const UNITS_PER_EM = 1000;
const PX_TO_FONT_UNITS = UNITS_PER_EM / TEMPLATE_DPI;

function fallbackAdvanceWidth(
  advanceWidthOverride: number | null,
  bboxWidthPx: number,
): number {
  return advanceWidthOverride ?? Math.round(bboxWidthPx * PX_TO_FONT_UNITS);
}

function slugifyFilename(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '-');
  return slug.length > 0 ? slug : 'font';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  return NextResponse.json(listBuilds(projectId));
}

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

  const rows = listApprovedGlyphsForBuild(projectId);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no approved glyphs' }, { status: 400 });
  }

  const glyphs = rows
    .filter((row) => row.type === 'single')
    .map((row) => ({
      char: row.charValue,
      svg_path: row.svgPath,
      advance_width: fallbackAdvanceWidth(row.advanceWidthOverride, row.bboxRaw[2]),
    }));
  const ligatures = rows
    .filter((row) => row.type === 'ligature')
    .map((row) => ({
      chars: row.charValue,
      component_chars: row.componentChars,
      svg_path: row.svgPath,
      advance_width: fallbackAdvanceWidth(row.advanceWidthOverride, row.bboxRaw[2]),
    }));

  // Resolved to an absolute path because the Python build tool is spawned with a
  // different working directory (the python/ package dir) than this Node process.
  const buildDir = path.resolve(DATA_DIR, 'projects', String(projectId), 'builds');
  await fs.mkdir(buildDir, { recursive: true });
  const specPath = path.join(buildDir, `spec-${Date.now()}.json`);
  const filenameBase = slugifyFilename(project.name);
  const otfPath = path.join(buildDir, `${filenameBase}.otf`);
  const ttfPath = path.join(buildDir, `${filenameBase}.ttf`);
  await fs.writeFile(specPath, JSON.stringify({ glyphs, ligatures }));

  const result = await runPythonTool('font_creator_tools.build_font', [
    '--spec',
    specPath,
    '--output-otf',
    otfPath,
    '--output-ttf',
    ttfPath,
    '--family-name',
    project.name,
  ]);

  if (!result.ok) {
    return NextResponse.json({ error: 'font build failed', details: result }, { status: 500 });
  }

  const build = createBuild(projectId, otfPath, ttfPath, { unitsPerEm: 1000, ascender: 800, descender: -200 });
  return NextResponse.json(build, { status: 201 });
}
