import { describe, expect, it } from 'vitest';
import { glyphPreviewBounds, glyphPreviewGeometry, type PreviewGlyph } from './glyphPreview';

function glyph(charLabel: string, bboxRaw: PreviewGlyph['bboxRaw'], overrides: Partial<PreviewGlyph> = {}): PreviewGlyph {
  return { id: 1, charLabel, bboxRaw, verticalOffsetOverride: null, scaleOverride: null, advanceWidthOverride: null, ...overrides };
}

describe('font-coordinate glyph previews', () => {
  it('puts short and tall letters on the same baseline without normalizing their heights', () => {
    const a = glyphPreviewGeometry(glyph('a', [10, 120, 60, 120]));
    const b = glyphPreviewGeometry(glyph('b', [30, 60, 40, 180]));
    expect(a.top + a.height).toBeCloseTo(0);
    expect(b.top + b.height).toBeCloseTo(0);
    expect(b.height / a.height).toBeCloseTo(1.5);
    expect(a.width).toBeCloseTo(200);
  });

  it('shows descenders below the baseline and applies offsets in font units', () => {
    const p = glyph('p', [10, 120, 60, 180]);
    const original = glyphPreviewGeometry(p);
    const lowered = glyphPreviewGeometry({ ...p, verticalOffsetOverride: -500 });
    expect(original.top + original.height).toBeCloseTo(200);
    expect(lowered.top - original.top).toBeCloseTo(500);
    expect(lowered.top + lowered.height).toBeCloseTo(700);
  });

  it('scales around the scan origin like the exported font, keeping advance width independent', () => {
    const geometry = glyphPreviewGeometry(glyph('a', [10, 120, 60, 120], {
      scaleOverride: 50, verticalOffsetOverride: -400, advanceWidthOverride: 350,
    }));
    expect(geometry.top).toBeCloseTo(-200);
    expect(geometry.top + geometry.height).toBeCloseTo(0);
    expect(geometry.width).toBeCloseTo(100);
    expect(geometry.advance).toBe(350);
  });

  it('shares the vertical frame across cards and extends it for extreme adjustments', () => {
    const a = glyph('a', [10, 120, 60, 120]);
    const p = glyph('p', [10, 120, 60, 180], { verticalOffsetOverride: -1000 });
    const shared = glyphPreviewBounds([a, p]);
    expect(shared).toEqual({ top: -800, bottom: 1200 });
    expect(glyphPreviewBounds([a], shared)).toEqual(glyphPreviewBounds([p], shared));
    expect(glyphPreviewBounds([{ ...a, verticalOffsetOverride: 1000 }], shared)).toEqual({ top: -1400, bottom: 1200 });
  });
});
