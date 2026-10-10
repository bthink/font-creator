'use client';
import { useState } from 'react';
import type { Build } from '@/lib/db/builds';
import { requestJson, errorMessage, formatDate } from '@/lib/client';
import { Icon } from './Icon';
export function FontBuildPanel({
  projectId,
  initialBuilds,
  approvedCount,
}: {
  projectId: number;
  initialBuilds: Build[];
  approvedCount: number;
}) {
  const [builds, setBuilds] = useState(initialBuilds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(
    'Pchnąć w tę łódź jeża lub ośm skrzyń fig.',
  );
  const [size, setSize] = useState(42);
  async function build() {
    setBusy(true);
    setError('');
    try {
      const result = await requestJson<Build>(
        `/api/projects/${projectId}/builds`,
        { method: 'POST' },
      );
      setBuilds((current) => [result, ...current]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const latest = builds[0];
  return (
    <div>
      <div className="build-callout">
        <span className="build-monogram" aria-hidden="true">
          Ag
        </span>
        <h3>
          {approvedCount
            ? 'Twój font jest o krok od gotowości.'
            : 'Najpierw dopracuj swoje glify.'}
        </h3>
        <p>
          {approvedCount
            ? `${approvedCount} zatwierdzonych znaków trafi do Twojego fontu.`
            : 'Wgraj skan i zatwierdź przynajmniej jeden glif w etapie „Skan i korekta”.'}
        </p>
        <button
          onClick={build}
          disabled={busy || !approvedCount}
          className="button primary"
        >
          <Icon name="type" />
          {busy ? 'Budowanie fontu...' : 'Zbuduj mój font'}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {latest && (
        <section className="font-preview">
          <style>{`@font-face { font-family: 'Preview-${latest.id}'; src: url('/api/builds/${latest.id}/download?format=ttf&v=${latest.id}'); font-display: swap; }`}</style>
          <div className="section-heading">
            <label className="field-label" htmlFor="font-preview">
              Wypróbuj swój font
            </label>
            <label className="preview-size">
              {size} px
              <input
                aria-label="Rozmiar podglądu"
                type="range"
                min="24"
                max="80"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </label>
          </div>
          <textarea
            id="font-preview"
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            style={{
              fontFamily: `'Preview-${latest.id}', serif`,
              fontSize: size,
            }}
          />
          <p className="field-hint">
            Kliknij tekst i napisz coś swojego. Brakujące znaki używają fontu
            zastępczego.
          </p>
        </section>
      )}
      <div className="scan-history">
        <h3>
          Pliki do pobrania <span className="count">{builds.length}</span>
        </h3>
        {builds.length ? (
          builds.map((item) => (
            <div className="history-row" key={item.id}>
              <Icon name="file" />
              <div>
                <strong>Wersja #{item.id}</strong>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <div className="download-links">
                {item.otfPath && (
                  <a
                    className="button secondary small"
                    href={`/api/builds/${item.id}/download?format=otf`}
                  >
                    <Icon name="download" /> OTF
                  </a>
                )}
                {item.ttfPath && (
                  <a
                    className="button secondary small"
                    href={`/api/builds/${item.id}/download?format=ttf`}
                  >
                    <Icon name="download" /> TTF
                  </a>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="muted">
            Po zbudowaniu fontu znajdziesz tutaj pliki OTF i TTF.
          </p>
        )}
      </div>
    </div>
  );
}
