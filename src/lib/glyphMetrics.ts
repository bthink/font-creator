// Font builder uses 1000 units per em; templates are scanned at 300 DPI.
export const FONT_UNITS_PER_EM = 1000;
export const SCAN_DPI = 300;
export const MIN_VERTICAL_OFFSET = -1000;
export const MAX_VERTICAL_OFFSET = 1000;
export const MIN_GLYPH_SCALE = 1;
export const MAX_GLYPH_SCALE = 200;
export function detectedAdvanceWidth(widthPx: number): number {
  return Math.round((widthPx * FONT_UNITS_PER_EM) / SCAN_DPI);
}
