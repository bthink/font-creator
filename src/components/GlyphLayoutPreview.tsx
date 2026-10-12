import { glyphPreviewGeometry, PREVIEW_PADDING, PREVIEW_PIXELS_PER_UNIT, type PreviewBounds, type PreviewGlyph } from '@/lib/glyphPreview';
import { FONT_ASCENDER } from '@/lib/glyphMetrics';

export function GlyphLayoutPreview({ glyphs, bounds, label, comparison = false, currentId, onError, pixelsPerUnit = PREVIEW_PIXELS_PER_UNIT }: {
  glyphs: (PreviewGlyph | null)[];
  bounds: PreviewBounds;
  label: string;
  comparison?: boolean;
  currentId?: number;
  onError?: () => void;
  pixelsPerUnit?: number;
}) {
  const top = bounds.top - PREVIEW_PADDING;
  const height = bounds.bottom - bounds.top + 2 * PREVIEW_PADDING;
  const slots = glyphs.map((glyph) => {
    const geometry = glyph ? glyphPreviewGeometry(glyph) : null;
    const slotWidth = comparison
      ? Math.max(300, (geometry?.width ?? 0) + 80, (geometry?.advance ?? 0) + 80)
      : geometry?.advance ?? 0;
    return { glyph, geometry, slotWidth };
  });
  const positioned = slots.map((slot, index) => ({
    ...slot,
    x: PREVIEW_PADDING + slots.slice(0, index).reduce((sum, previous) => sum + previous.slotWidth, 0),
  }));
  const width = Math.max(1000, slots.reduce((sum, slot) => sum + slot.slotWidth, 2 * PREVIEW_PADDING),
    ...positioned.map(({ x, geometry }) => x + (geometry?.width ?? 0) + PREVIEW_PADDING));
  return (
    <div className="glyph-layout-preview" role="img" aria-label={label}>
      <span className="glyph-layout-baseline-rule" style={{ top: -top * pixelsPerUnit }} />
      <span className="glyph-layout-ascender-rule" style={{ top: (-FONT_ASCENDER - top) * pixelsPerUnit }} />
      <svg
        viewBox={`0 ${top} ${width} ${height}`}
        width={width * pixelsPerUnit}
        height={height * pixelsPerUnit}
        aria-hidden="true"
      >
        {positioned.map(({ glyph, x, slotWidth }, index) => comparison && glyph?.id === currentId ? (
          <rect key={index} className="glyph-layout-selection" x={x - 40} y={top + 10} width={slotWidth} height={height - 20} />
        ) : null)}
        {positioned.map(({ glyph, geometry, x, slotWidth }, index) => glyph && geometry ? (
          <g key={index}>
            {!comparison && <line className="glyph-layout-guide" x1={x + slotWidth} x2={x + slotWidth} y1={bounds.top} y2={bounds.bottom} />}
            <image
              href={`/api/glyphs/${glyph.id}/preview`}
              x={x}
              y={geometry.top}
              width={geometry.width}
              height={geometry.height}
              preserveAspectRatio="none"
              onError={onError}
            />
          </g>
        ) : null)}
      </svg>
    </div>
  );
}
