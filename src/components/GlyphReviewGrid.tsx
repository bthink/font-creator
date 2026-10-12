'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GlyphWithChar } from '@/lib/db/glyphs';
import { GlyphWidthEditor, type GlyphNeighbor } from './GlyphWidthEditor';
import { errorMessage, requestJson } from '@/lib/client';
import { glyphPreviewBounds, PREVIEW_PIXELS_PER_UNIT, type PreviewGlyph } from '@/lib/glyphPreview';

function neighborsFor(items: GlyphWithChar[], index: number): GlyphNeighbor[] {
  const candidates = [-2, -1, 1, 2]
    .filter((offset) => index + offset >= 0 && index + offset < items.length)
    .map((offset) => ({ item: items[index + offset], comparisonSlot: offset + 2 }));
  return candidates
    .filter(({ item }) => item.svgPath && item.status !== 'failed')
    .map(({ item, comparisonSlot }) => ({
      id: item.id,
      comparisonSlot,
      charLabel: item.charLabel,
      svgPath: item.svgPath,
      status: item.status,
      verticalOffsetOverride: item.verticalOffsetOverride,
      scaleOverride: item.scaleOverride,
      bboxRaw: item.bboxRaw,
      advanceWidthOverride: item.advanceWidthOverride,
    }));
}

export function GlyphReviewGrid({
  projectId,
  glyphs,
}: {
  projectId: number;
  glyphs: GlyphWithChar[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(glyphs);
  const [filter, setFilter] = useState('all');
  const [previewZoom, setPreviewZoom] = useState(PREVIEW_PIXELS_PER_UNIT);
  const [previewDrafts, setPreviewDrafts] = useState<Record<number, PreviewGlyph>>({});
  const [approvingAll, setApprovingAll] = useState(false);
  const [error, setError] = useState('');
  const approved = items.filter((g) => g.status === 'approved').length;
  const previewItems = items.map((glyph) => ({ ...glyph, ...previewDrafts[glyph.id] }));
  const previewBounds = glyphPreviewBounds(previewItems.filter((g) => g.svgPath && g.status !== 'failed'));
  const visible = items.filter(
    (g) =>
      filter === 'all' ||
      (filter === 'approved'
        ? g.status === 'approved'
        : g.status !== 'approved'),
  );
  async function approveAll() {
    if (approvingAll || !items.length) return;
    setApprovingAll(true);
    setError('');
    try {
      await requestJson(`/api/projects/${projectId}/glyphs/approve`, {
        method: 'POST',
      });
      setItems((current) =>
        current.map((glyph) => ({ ...glyph, status: 'approved' })),
      );
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setApprovingAll(false);
    }
  }
  return (
    <div>
      <div className="review-toolbar">
        <div className="filter-buttons" aria-label="Filtr glifów">
          {[
            ['all', 'Wszystkie', items.length],
            ['pending', 'Do sprawdzenia', items.length - approved],
            ['approved', 'Zatwierdzone', approved],
          ].map(([value, label, count]) => (
            <button
              key={value}
              className={filter === value ? 'selected' : ''}
              aria-pressed={filter === value}
              onClick={() => setFilter(String(value))}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <span className="muted" role="status">
          {approved} z {items.length} zatwierdzonych
        </span>
        <button
          type="button"
          className="button primary bulk-approve"
          disabled={!items.length || approved === items.length || approvingAll}
          onClick={() => void approveAll()}
        >
          {approvingAll ? 'Zatwierdzanie...' : 'Zatwierdź wszystkie'}
        </button>
      </div>
      <label className="preview-zoom-control">
        Powiększenie podglądów
        <select className="text-input" value={previewZoom} onChange={(event) => setPreviewZoom(Number(event.target.value))}>
          <option value={0.1}>100%</option>
          <option value={0.15}>150%</option>
          <option value={0.2}>200%</option>
          <option value={0.3}>300%</option>
        </select>
        <span className="field-hint">Wspólna skala dla wszystkich znaków.</span>
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      {visible.length ? (
        <div className="review-grid">
          {visible.map((glyph) => (
            <GlyphWidthEditor
              key={`${glyph.id}-${glyph.status}`}
              glyph={glyph}
              charLabel={glyph.charLabel}
              previewBounds={previewBounds}
              previewZoom={previewZoom}
              neighbors={neighborsFor(previewItems, items.findIndex((item) => item.id === glyph.id))}
              onPreviewChange={(preview) => setPreviewDrafts((current) => ({ ...current, [glyph.id]: preview }))}
              onSaved={(status, width, verticalOffset, scale) => {
                setPreviewDrafts((current) => Object.fromEntries(
                  Object.entries(current).filter(([id]) => Number(id) !== glyph.id),
                ));
                setItems((current) =>
                  current.map((g) =>
                    g.id === glyph.id
                      ? { ...g, status, advanceWidthOverride: width, verticalOffsetOverride: verticalOffset, scaleOverride: scale }
                      : g,
                  ),
                );
                router.refresh();
              }}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>
            {items.length
              ? 'Wszystko na swoim miejscu'
              : 'Brak wyodrębnionych glifów'}
          </h3>
          <p>
            {items.length
              ? 'Brak znaków pasujących do tego filtra.'
              : 'Wróć do projektu i wgraj wyraźny, wypełniony skan szablonu.'}
          </p>
        </div>
      )}
    </div>
  );
}
