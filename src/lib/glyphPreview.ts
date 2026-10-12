import { FONT_ASCENDER, FONT_DESCENDER, FONT_UNITS_PER_EM, SCAN_DPI, detectedAdvanceWidth } from './glyphMetrics';

export type PreviewGlyph = {
  id: number;
  charLabel: string;
  bboxRaw: [number, number, number, number] | null;
  verticalOffsetOverride: number | null;
  scaleOverride: number | null;
  advanceWidthOverride: number | null;
};

export type PreviewBounds = { top: number; bottom: number };
// Every card uses the same number of pixels per font unit.
export const PREVIEW_PIXELS_PER_UNIT = 0.15;
export const PREVIEW_PADDING = 120;

export function glyphPreviewGeometry(glyph: PreviewGlyph) {
  const [, y, width, height] = glyph.bboxRaw ?? [0, 0, 0, 0];
  const scale = (FONT_UNITS_PER_EM / SCAN_DPI) * ((glyph.scaleOverride ?? 100) / 100);
  // Match svg_to_font_transform: y_font = ascender + offset - y_scan * scale.
  // Screen coordinates point down, with the baseline at y = 0.
  return {
    top: y * scale - FONT_ASCENDER - (glyph.verticalOffsetOverride ?? 0),
    width: width * scale,
    height: height * scale,
    advance: glyph.advanceWidthOverride ?? detectedAdvanceWidth(width),
  };
}

export function glyphPreviewBounds(glyphs: PreviewGlyph[], bounds?: PreviewBounds): PreviewBounds {
  let top = Math.min(-FONT_ASCENDER, bounds?.top ?? -FONT_ASCENDER);
  let bottom = Math.max(-FONT_DESCENDER, bounds?.bottom ?? -FONT_DESCENDER);
  for (const glyph of glyphs) {
    const geometry = glyphPreviewGeometry(glyph);
    top = Math.min(top, geometry.top);
    bottom = Math.max(bottom, geometry.top + geometry.height);
  }
  return { top, bottom };
}
