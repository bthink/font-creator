'use client';
import { useState } from 'react';
import type { GlyphWithChar } from '@/lib/db/glyphs';
import { GlyphWidthEditor } from './GlyphWidthEditor';
export function GlyphReviewGrid({ glyphs }: { glyphs: GlyphWithChar[] }) {
  const [items, setItems] = useState(glyphs);
  const [filter, setFilter] = useState('all');
  const approved = items.filter((g) => g.status === 'approved').length;
  const visible = items.filter(
    (g) =>
      filter === 'all' ||
      (filter === 'approved'
        ? g.status === 'approved'
        : g.status !== 'approved'),
  );
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
      </div>
      {visible.length ? (
        <div className="review-grid">
          {visible.map((glyph) => (
            <GlyphWidthEditor
              key={glyph.id}
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
