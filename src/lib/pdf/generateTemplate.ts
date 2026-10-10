import { SCAN_DPI } from '@/lib/glyphMetrics';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import type { GlyphSetEntry } from '@/lib/db/glyphSets';

const TEMPLATE_FONT_PATH = path.join(process.cwd(), 'src/lib/pdf/fonts/NotoSans-Regular.ttf');

export type GridConfig = {
  columns: number;
  rows: number;
  cellSizePt: number;
  markerSizePt: number;
  glyphSetIds?: number[];
};

// Canonical raster resolution shared across the scan pipeline. MUST be kept in
// sync with `DPI` in python/src/font_creator_tools/align_scan.py — there is no
// cross-language shared-config mechanism in this stack, so this code comment is
// the pragmatic guard.
export const TEMPLATE_DPI = SCAN_DPI;

// Inset (pt) of the cell grid from the page edges. Also the origin of the cell
// grid in PDF space: (PAGE_MARGIN_PT, PAGE_MARGIN_PT).
export const PAGE_MARGIN_PT = 40;

// Inset (pt) of registration markers from the page edges, and their size (pt).
// MUST match drawRegistrationMarkers below and the Python align/extract tools.
export const MARKER_MARGIN_PT = 10;

// Height (pt) of the reference-label strip at the top of each cell. Glyph
// extraction crops only the area below this strip, so the printed label
// never bleeds into the traced glyph outline. MUST match extract_glyphs.py.
export const LABEL_HEIGHT_PT = 14;

export function computePageDimensions(grid: GridConfig): {
  widthPt: number;
  heightPt: number;
} {
  return {
    widthPt: PAGE_MARGIN_PT * 2 + grid.columns * grid.cellSizePt,
    heightPt: PAGE_MARGIN_PT * 2 + grid.rows * grid.cellSizePt,
  };
}

export async function generateTemplatePdf(
  entries: GlyphSetEntry[],
  grid: GridConfig,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(TEMPLATE_FONT_PATH);
  const font = await doc.embedFont(fontBytes);
  const cellsPerPage = grid.columns * grid.rows;
  const { widthPt: pageWidth, heightPt: pageHeight } = computePageDimensions(grid);

  for (let pageStart = 0; pageStart < entries.length; pageStart += cellsPerPage) {
    const page = doc.addPage([pageWidth, pageHeight]);
    drawRegistrationMarkers(page, pageWidth, pageHeight, grid.markerSizePt);

    const pageEntries = entries.slice(pageStart, pageStart + cellsPerPage);
    pageEntries.forEach((entry, index) => {
      const col = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const x = PAGE_MARGIN_PT + col * grid.cellSizePt;
      const y = pageHeight - PAGE_MARGIN_PT - (row + 1) * grid.cellSizePt;

      page.drawRectangle({
        x,
        y,
        width: grid.cellSizePt,
        height: grid.cellSizePt,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      });
      const labelSize = LABEL_HEIGHT_PT * 0.7;
      page.drawText(entry.charValue, {
        x: x + 4,
        y: y + grid.cellSizePt - labelSize - 2,
        size: labelSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawLine({
        start: { x, y: y + grid.cellSizePt - LABEL_HEIGHT_PT },
        end: { x: x + grid.cellSizePt, y: y + grid.cellSizePt - LABEL_HEIGHT_PT },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
    });
  }

  return doc.save();
}

function drawRegistrationMarkers(
  page: import('pdf-lib').PDFPage,
  pageWidth: number,
  pageHeight: number,
  markerSize: number,
): void {
  const margin = MARKER_MARGIN_PT;
  const corners = [
    [margin, pageHeight - margin - markerSize],
    [pageWidth - margin - markerSize, pageHeight - margin - markerSize],
    [margin, margin],
    [pageWidth - margin - markerSize, margin],
  ];
  for (const [x, y] of corners) {
    page.drawRectangle({ x, y, width: markerSize, height: markerSize, color: rgb(0, 0, 0) });
  }
}
