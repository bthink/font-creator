import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { GlyphSetEntry } from '@/lib/db/glyphSets';

export type GridConfig = {
  columns: number;
  rows: number;
  cellSizePt: number;
  markerSizePt: number;
};

// Canonical raster resolution shared across the scan pipeline. MUST be kept in
// sync with `DPI` in python/src/font_creator_tools/align_scan.py — there is no
// cross-language shared-config mechanism in this stack, so this code comment is
// the pragmatic guard.
export const TEMPLATE_DPI = 300;

// Inset (pt) of the cell grid from the page edges. Also the origin of the cell
// grid in PDF space: (PAGE_MARGIN_PT, PAGE_MARGIN_PT).
export const PAGE_MARGIN_PT = 40;

// Inset (pt) of registration markers from the page edges, and their size (pt).
// MUST match drawRegistrationMarkers below and the Python align/extract tools.
export const MARKER_MARGIN_PT = 10;

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
  const font = await doc.embedFont(StandardFonts.Helvetica);
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
      page.drawText(entry.charValue, {
        x: x + grid.cellSizePt / 2 - 10,
        y: y + grid.cellSizePt / 2 - 10,
        size: grid.cellSizePt * 0.4,
        font,
        color: rgb(0.85, 0.85, 0.85),
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
