'use client';
import { useState } from 'react';
import type { Glyph } from '@/lib/db/glyphs';
import { requestJson, errorMessage } from '@/lib/client';
import { detectedAdvanceWidth, FONT_UNITS_PER_EM, SCAN_DPI, MIN_GLYPH_SCALE, MAX_GLYPH_SCALE, MIN_VERTICAL_OFFSET, MAX_VERTICAL_OFFSET } from '@/lib/glyphMetrics';
import { Icon } from './Icon';

export type GlyphNeighbor = {
  id: number;
  comparisonSlot: number;
  charLabel: string;
  svgPath: string | null;
  status: Glyph['status'];
  verticalOffsetOverride: number | null;
  scaleOverride: number | null;
};

export function GlyphWidthEditor({
  glyph,
  charLabel,
  neighbors,
  onSaved,
}: {
  glyph: Glyph;
  charLabel: string;
  neighbors: GlyphNeighbor[];
  onSaved: (status: Glyph['status'], width: number, verticalOffset: number, scale: number) => void;
}) {
  const detected = detectedAdvanceWidth(glyph.bboxRaw?.[2] ?? 0);
  const [width, setWidth] = useState(glyph.advanceWidthOverride ?? detected);
  const [savedWidth, setSavedWidth] = useState(width);
  const [verticalOffset, setVerticalOffset] = useState(glyph.verticalOffsetOverride ?? 0);
  const [savedVerticalOffset, setSavedVerticalOffset] = useState(verticalOffset);
  const [scale, setScale] = useState(glyph.scaleOverride ?? 100);
  const [savedScale, setSavedScale] = useState(scale);
  const [status, setStatus] = useState(glyph.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const valid = Number.isInteger(width) && width >= 0 && width <= 5000
    && Number.isInteger(verticalOffset) && verticalOffset >= MIN_VERTICAL_OFFSET && verticalOffset <= MAX_VERTICAL_OFFSET
    && Number.isInteger(scale) && scale >= MIN_GLYPH_SCALE && scale <= MAX_GLYPH_SCALE;
  const dirty = width !== savedWidth || verticalOffset !== savedVerticalOffset || scale !== savedScale;
  const previewScale = 45 / Math.max(1, detectedAdvanceWidth(glyph.bboxRaw?.[3] ?? 1));
  const offsetPreviewPixels = (offset: number) => Math.abs(Number.isFinite(offset) ? offset : 0)
    * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale;
  const comparisonPadding = 10 + Math.ceil(Math.max(
    offsetPreviewPixels(verticalOffset),
    ...neighbors.map((neighbor) => offsetPreviewPixels(neighbor.verticalOffsetOverride ?? 0)),
  ));
  async function save(nextStatus: Glyph['status']) {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/glyphs/${glyph.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advanceWidthOverride: width,
          verticalOffsetOverride: verticalOffset,
          scaleOverride: scale,
          status: nextStatus,
        }),
      });
      setStatus(nextStatus);
      setSavedWidth(width);
      setSavedVerticalOffset(verticalOffset);
      setSavedScale(scale);
      onSaved(nextStatus, width, verticalOffset, scale);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const usable = !!glyph.svgPath && glyph.status !== 'failed' && !previewFailed;
  return (
    <article
      className={`glyph-card ${status === 'approved' && !dirty ? 'approved' : ''}`}
    >
      <div className="glyph-card-header">
        <span className="glyph-label">{charLabel}</span>
        <span
          className={`badge ${status === 'approved' && !dirty ? 'green' : ''}`}
        >
          {dirty
            ? 'Niezapisane zmiany'
            : status === 'approved'
              ? 'Zatwierdzony'
              : status === 'failed'
                ? 'Błąd odczytu'
                : 'Do sprawdzenia'}
        </span>
      </div>
      <div className="glyph-preview">
        {glyph.svgPath && !previewFailed ? (
          // Generated SVG is served through a contained, sandboxed endpoint and needs no image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/glyphs/${glyph.id}/preview`}
            alt={`Zeskanowany glif ${charLabel}`}
            onError={() => setPreviewFailed(true)}
            style={{ transform: `scale(${scale / 100})`, transformOrigin: 'top left' }}
          />
        ) : (
          <p className="muted">Podgląd niedostępny. Wgraj skan ponownie.</p>
        )}
      </div>
      <label htmlFor={`width-${glyph.id}`} className="field-label">
        Szerokość znaku i odstępu
      </label>
      <div className="width-controls">
        <input
          id={`width-${glyph.id}`}
          aria-label={`Szerokość glifu ${charLabel}`}
          type="range"
          min="0"
          max={Math.min(5000, Math.max(1000, detected * 2, width || 0))}
          value={Number.isFinite(width) ? width : 0}
          disabled={busy || !usable}
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <input
          className="text-input"
          aria-label={`Dokładna szerokość glifu ${charLabel}`}
          type="number"
          min="0"
          max="5000"
          value={Number.isNaN(width) ? '' : width}
          disabled={busy || !usable}
          onChange={(e) =>
            setWidth(e.target.value === '' ? NaN : Number(e.target.value))
          }
        />
      </div>
      <label htmlFor={`voffset-${glyph.id}`} className="field-label">
        Pozycja w pionie
      </label>
      <div className="width-controls">
        <input
          id={`voffset-${glyph.id}`}
          aria-label={`Pozycja w pionie glifu ${charLabel}`}
          type="range"
          min={MIN_VERTICAL_OFFSET}
          max={MAX_VERTICAL_OFFSET}
          step="1"
          value={Number.isFinite(verticalOffset) ? verticalOffset : 0}
          disabled={busy || !usable}
          onChange={(event) => setVerticalOffset(Number(event.target.value))}
        />
        <input
          className="text-input"
          aria-label={`Dokładna pozycja w pionie glifu ${charLabel}`}
          type="number"
          min={MIN_VERTICAL_OFFSET}
          max={MAX_VERTICAL_OFFSET}
          step="1"
          value={Number.isNaN(verticalOffset) ? '' : verticalOffset}
          disabled={busy || !usable}
          onChange={(e) => setVerticalOffset(e.target.value === '' ? NaN : Number(e.target.value))}
        />
      </div>
      <p className="field-hint">
        Ujemne wartości przesuwają znak w dół, dodatnie w górę. Zakres: {MIN_VERTICAL_OFFSET} do {MAX_VERTICAL_OFFSET}.
      </p>
      <label htmlFor={`scale-${glyph.id}`} className="field-label">
        Rozmiar (%)
      </label>
      <div className="width-controls">
        <input
          id={`scale-${glyph.id}`}
          aria-label={`Rozmiar glifu ${charLabel}`}
          type="range"
          min={MIN_GLYPH_SCALE}
          max={MAX_GLYPH_SCALE}
          step="1"
          value={Number.isFinite(scale) ? scale : MIN_GLYPH_SCALE}
          disabled={busy || !usable}
          onChange={(event) => setScale(Number(event.target.value))}
        />
        <input
          className="text-input"
          aria-label={`Dokładny rozmiar glifu ${charLabel} w procentach`}
          type="number"
          min={MIN_GLYPH_SCALE}
          max={MAX_GLYPH_SCALE}
          step="1"
          value={Number.isNaN(scale) ? '' : scale}
          disabled={busy || !usable}
          onChange={(e) => setScale(e.target.value === '' ? NaN : Number(e.target.value))}
        />
      </div>
      {usable && neighbors.length > 0 && (
        <div className="vertical-compare-strip" style={{ paddingBlock: comparisonPadding }} aria-label={`Porównanie pozycji glifu ${charLabel} z sąsiednimi znakami`}>
          <span className="vertical-compare-line" />
          {[0, 1, 2, 3, 4].map((slot) => {
            const current = slot === 2;
            const neighbor = neighbors.find((item) => item.comparisonSlot === slot && item.id !== glyph.id);
            if (!current && !neighbor) {
              return <span className="compare-slot" key={slot} aria-hidden="true" />;
            }
            const id = current ? glyph.id : neighbor!.id;
            const label = current ? charLabel : neighbor!.charLabel;
            const offset = current ? verticalOffset : (neighbor!.verticalOffsetOverride ?? 0);
            const size = current ? scale : (neighbor!.scaleOverride ?? 100);
            return (
              <span
                className={`compare-slot${current ? ' current' : ''}`}
                key={slot}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/glyphs/${id}/preview`}
                  alt={`${current ? 'Bieżący' : 'Sąsiedni'} glif ${label}`}
                  style={{
                    transform: `translateY(${-offset * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale}px) scale(${size / 100})`,
                  }}
                />
              </span>
            );
          })}
        </div>
      )}
      {usable && valid && (
        <div
          className="spacing-preview"
          style={{ paddingBlock: 10 + Math.ceil(offsetPreviewPixels(verticalOffset)) }}
          aria-label={`Podgląd odstępu dla glifu ${charLabel}`}
        >
          {[0, 1, 2].map((index) => (
            <span key={index} style={{ width: width * previewScale }}>
              {/* The preview repeats the actual cropped glyph at the selected advance width. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/glyphs/${glyph.id}/preview`}
                alt=""
                style={{
                  width: detected * previewScale,
                  maxWidth: 'none',
                  transform: `translateY(${-verticalOffset * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale}px) scale(${scale / 100})`,
                  transformOrigin: 'top left',
                }}
              />
            </span>
          ))}
        </div>
      )}
      <p className="field-hint">
        Jednostki fontu · wykryto {detected} · zapis po zatwierdzeniu
      </p>
      <button
        type="button"
        className="button primary"
        disabled={
          !usable || busy || !valid || (status === 'approved' && !dirty)
        }
        onClick={() => save('approved')}
      >
        <Icon name="check" />
        {busy
          ? 'Zapisywanie...'
          : status === 'approved' && !dirty
            ? 'Zatwierdzono'
            : 'Zapisz i zatwierdź'}
      </button>
      {status === 'approved' && (
        <button
          className="button secondary small"
          disabled={busy || !valid}
          onClick={() => save('reviewed')}
        >
          Cofnij zatwierdzenie
        </button>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
