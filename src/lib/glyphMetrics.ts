// Font builder uses 1000 units per em; templates are scanned at 300 DPI.
export const FONT_UNITS_PER_EM = 1000;
export const SCAN_DPI = 300;
export function detectedAdvanceWidth(widthPx: number): number {
  return Math.round((widthPx * FONT_UNITS_PER_EM) / SCAN_DPI);
}
