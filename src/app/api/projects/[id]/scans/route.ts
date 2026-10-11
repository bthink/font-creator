import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/db/projects';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import {
  createScan,
  listUploadedPageIndexes,
  updateScanAlignment,
} from '@/lib/db/scans';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { createGlyph } from '@/lib/db/glyphs';
import { runPythonTool } from '@/lib/python/runPython';
import {
  computePageDimensions,
  TEMPLATE_DPI,
  PAGE_MARGIN_PT,
  MARKER_MARGIN_PT,
  LABEL_HEIGHT_PT,
} from '@/lib/pdf/generateTemplate';

const DATA_DIR = process.env.DATA_DIR ?? './data';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const templateVersion = getLatestTemplateVersion(projectId);
  if (!templateVersion) {
    return NextResponse.json(
      { error: 'no template generated yet' },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (
    !['image/png', 'image/jpeg'].includes(file.type) ||
    file.size > 30 * 1024 * 1024
  ) {
    return NextResponse.json(
      { error: 'Wybierz plik PNG lub JPG o rozmiarze do 30 MB.' },
      { status: 400 },
    );
  }
  const entries = listGlyphSetEntries(projectId);
  const grid = templateVersion.gridConfig;
  if (
    !grid.glyphSetIds ||
    JSON.stringify(grid.glyphSetIds) !==
      JSON.stringify(entries.map((entry) => entry.id))
  ) {
    return NextResponse.json(
      {
        error:
          'Zestaw znaków zmienił się od wygenerowania szablonu. Pobierz i wypełnij nowy szablon.',
      },
      { status: 400 },
    );
  }
  const cellsPerPage = grid.columns * grid.rows;
  const requestedPageIndex = formData.get('pageIndex');
  const uploadedPageIndexes = listUploadedPageIndexes(
    projectId,
    templateVersion.id,
    cellsPerPage,
  );
  const pageIndex =
    requestedPageIndex === null
      ? Array.from({ length: Math.ceil(entries.length / cellsPerPage) }, (_, index) => index)
          .find((index) => !uploadedPageIndexes.includes(index)) ?? 0
      : Number(requestedPageIndex);
  if (
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= Math.ceil(entries.length / cellsPerPage)
  ) {
    return NextResponse.json(
      { error: 'Nieprawidłowy numer strony szablonu.' },
      { status: 400 },
    );
  }
  const projectDir = path.join(
    DATA_DIR,
    'projects',
    String(projectId),
    'scans',
  );
  await fs.mkdir(projectDir, { recursive: true });
  const rawPath = path.join(projectDir, `raw-${Date.now()}.png`);
  const alignedPath = path.join(projectDir, `aligned-${Date.now()}.png`);
  await fs.writeFile(rawPath, Buffer.from(await file.arrayBuffer()));

  const { widthPt: pageWidthPt, heightPt: pageHeightPt } =
    computePageDimensions(grid);
  const scale = TEMPLATE_DPI / 72;

  const scan = createScan(projectId, templateVersion.id, alignedPath, file.name, pageIndex);
  try {
    const result = await runPythonTool('font_creator_tools.align_scan', [
      '--input',
      path.resolve(rawPath),
      '--output',
      path.resolve(alignedPath),
      '--page-width-pt',
      String(pageWidthPt),
      '--page-height-pt',
      String(pageHeightPt),
      '--marker-margin-pt',
      String(MARKER_MARGIN_PT),
      '--marker-size-pt',
      String(grid.markerSizePt),
      '--dpi',
      String(TEMPLATE_DPI),
    ]);
    updateScanAlignment(scan.id, result.ok ? 'aligned' : 'failed');

    if (result.ok) {
      const glyphOutputDir = path.resolve(
        path.join(projectDir, `glyphs-${scan.id}`),
      );
      const originPx = PAGE_MARGIN_PT * scale;
      const extraction = await runPythonTool(
        'font_creator_tools.extract_glyphs',
        [
          '--input',
          path.resolve(alignedPath),
          '--columns',
          String(grid.columns),
          '--rows',
          String(grid.rows),
          '--cell-size-px',
          String(grid.cellSizePt * scale),
          '--origin-x-px',
          String(originPx),
          '--origin-y-px',
          String(originPx),
          '--label-height-px',
          String(LABEL_HEIGHT_PT * scale),
          '--output-dir',
          glyphOutputDir,
        ],
      );
      if (!extraction.ok) {
        updateScanAlignment(scan.id, 'failed');
        return NextResponse.json(
          {
            error:
              'Nie udało się wyodrębnić glifów. Sprawdź skan i instalację potrace.',
          },
          { status: 422 },
        );
      }
      if (extraction.ok) {
        const cells = extraction.cells as {
          index: number;
          svg_path: string;
          bbox: [number, number, number, number];
        }[];
        for (const cell of cells) {
          const entry = entries[pageIndex * cellsPerPage + cell.index];
          if (entry) {
            createGlyph(entry.id, scan.id, cell.svg_path, cell.bbox);
          }
        }
      }
    }

    return NextResponse.json({
      ...scan,
      alignmentStatus: result.ok ? 'aligned' : 'failed',
      pageIndex,
    });
  } catch {
    updateScanAlignment(scan.id, 'failed');
    return NextResponse.json(
      {
        error:
          'Nie udało się przetworzyć skanu. Sprawdź instalację uv, zależności Pythona i potrace.',
      },
      { status: 500 },
    );
  }
}
