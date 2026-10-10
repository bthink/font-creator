'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GlyphWithChar } from '@/lib/db/glyphs';
import { GlyphWidthEditor } from './GlyphWidthEditor';
import { errorMessage, requestJson } from '@/lib/client';
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
  const [approvingAll, setApprovingAll] = useState(false);
  const [error, setError] = useState('');
  const approved = items.filter((g) => g.status === 'approved').length;
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
      {error && <p className="notice error" role="alert">{error}</p>}
      {visible.length ? (
        <div className="review-grid">
          {visible.map((glyph) => (
            <GlyphWidthEditor
              key={`${glyph.id}-${glyph.status}`}
              glyph={glyph}
              charLabel={glyph.charLabel}
              onSaved={(status, width) =>
                setItems((current) =>
                  current.map((g) =>
                    g.id === glyph.id
                      ? { ...g, status, advanceWidthOverride: width }
                      : g,
                  ),
                )
              }
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
