import { GlyphWidthEditor } from './GlyphWidthEditor';

type GlyphWithChar = {
  id: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
  charLabel: string;
};

export function GlyphReviewGrid({ glyphs }: { glyphs: GlyphWithChar[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-4">
      {glyphs.map((glyph) => (
        <GlyphWidthEditor key={glyph.id} glyph={glyph} charLabel={glyph.charLabel} />
      ))}
    </div>
  );
}
