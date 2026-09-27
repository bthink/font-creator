'use client';

import { useState } from 'react';

type Glyph = {
  id: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

export function GlyphWidthEditor({ glyph, charLabel }: { glyph: Glyph; charLabel: string }): React.JSX.Element {
  const detectedWidth = glyph.bboxRaw ? glyph.bboxRaw[2] : 0;
  const [width, setWidth] = useState(glyph.advanceWidthOverride ?? detectedWidth);

  async function persist(nextWidth: number): Promise<void> {
    setWidth(nextWidth);
    await fetch(`/api/glyphs/${glyph.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceWidthOverride: nextWidth }),
    });
  }

  async function approve(): Promise<void> {
    await fetch(`/api/glyphs/${glyph.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
  }

  return (
    <div className="rounded border p-3">
      <p className="font-mono text-lg">{charLabel}</p>
      <div className="my-2 flex items-end bg-gray-50 p-2" style={{ width: `${width + 60}px` }}>
        <span style={{ width: `${width}px` }} className="inline-block border-r border-dashed border-red-400">
          {charLabel}
        </span>
        <span>n</span>
      </div>
      <label htmlFor={`width-${glyph.id}`} className="block text-sm">
        Advance width: {width}px (detected: {detectedWidth}px)
      </label>
      <input
        id={`width-${glyph.id}`}
        type="range"
        min={Math.max(0, detectedWidth - 40)}
        max={detectedWidth + 40}
        value={width}
        onChange={(event) => persist(Number(event.target.value))}
        className="w-full"
      />
      <button type="button" onClick={approve} className="mt-2 rounded bg-green-600 px-3 py-1 text-white">
        Approve
      </button>
    </div>
  );
}
