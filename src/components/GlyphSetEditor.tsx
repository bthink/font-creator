'use client';
import { useState } from 'react';
import { GLYPH_PRESETS } from '@/lib/glyphPresets';
import { requestJson, errorMessage } from '@/lib/client';
import type { GlyphSetEntry } from '@/lib/db/glyphSets';
import { Icon } from './Icon';
const presetNames: Record<string, [string, string]> = {
  english: ['Alfabet angielski', 'Aa Bb Cc'],
  polish: ['Alfabet polski', 'Ąą Ęę Łł'],
  icelandic: ['Alfabet islandzki', 'Ðð Þþ Ææ'],
  digits: ['Cyfry', '0123456789'],
  'basic-punctuation': ['Interpunkcja', '.,!?;:'],
  'basic-math': ['Matematyka', '+ − = × ÷'],
  'basic-currencies': ['Waluty', '$ € £ ¥'],
};

export function GlyphSetEditor({
  projectId,
  initialEntries,
  onEntriesChange,
}: {
  projectId: number;
  initialEntries: GlyphSetEntry[];
  onEntriesChange?: (entries: GlyphSetEntry[]) => void;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [charValue, setCharValue] = useState('');
  const [componentChars, setComponentChars] = useState('');
  const [isLigature, setIsLigature] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  function update(next: GlyphSetEntry[]) {
    setEntries(next);
    onEntriesChange?.(next);
  }
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function applyPresets() {
    await mutate(async () => {
      const charValues = [
        ...new Set(
          GLYPH_PRESETS.filter((p) => selected.includes(p.id)).flatMap(
            (p) => p.chars,
          ),
        ),
      ];
      const { added } = await requestJson<{ added: GlyphSetEntry[] }>(
        `/api/projects/${projectId}/glyph-set/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ charValues }),
        },
      );
      if (added.length) update([...entries, ...added]);
      setSelected([]);
      setMessage(
        added.length
          ? `Dodano ${added.length} znaków. Powtarzające się znaki zostały pominięte.`
          : 'Wszystkie wybrane znaki są już w zestawie.',
      );
    });
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (entries.some((e) => e.charValue === charValue)) {
      setError('Ten znak jest już w zestawie.');
      return;
    }
    if (!isLigature && [...charValue].length !== 1) {
      setError('Wpisz jeden znak lub włącz opcję ligatury.');
      return;
    }
    await mutate(async () => {
      const entry = await requestJson<GlyphSetEntry>(
        `/api/projects/${projectId}/glyph-set`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            charValue,
            type: isLigature ? 'ligature' : 'single',
            componentChars: isLigature ? componentChars : undefined,
          }),
        },
      );
      update([...entries, entry]);
      setCharValue('');
      setComponentChars('');
      setMessage('Znak został dodany.');
    });
  }
  async function remove(entry: GlyphSetEntry) {
    if (
      !window.confirm(
        `Usunąć znak „${entry.charValue}”? Zostaną usunięte również jego zeskanowane glify.`,
      )
    )
      return;
    await mutate(async () => {
      await requestJson(`/api/projects/${projectId}/glyph-set/${entry.id}`, {
        method: 'DELETE',
      });
      update(entries.filter((e) => e.id !== entry.id));
      setMessage('Znak został usunięty.');
    });
  }
  return (
    <div>
      <fieldset className="preset-fieldset" disabled={busy}>
        <legend className="field-label">Gotowe zestawy</legend>
        <div className="preset-grid">
          {GLYPH_PRESETS.map((p) => (
            <label
              className={`preset-card ${selected.includes(p.id) ? 'selected' : ''}`}
              key={p.id}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(p.id)
                      ? current.filter((id) => id !== p.id)
                      : [...current, p.id],
                  )
                }
              />
              <span className="preset-sample">{presetNames[p.id][1]}</span>
              <span className="preset-name">{presetNames[p.id][0]}</span>
              <small>{p.chars.length} znaków</small>
            </label>
          ))}
        </div>
        <div className="preset-actions">
          <p className="field-hint">
            Możesz łączyć zestawy. Duplikaty pominiemy.
          </p>
          <button
            className="button secondary"
            type="button"
            disabled={!selected.length || busy}
            onClick={applyPresets}
          >
            <Icon name="plus" /> {busy ? 'Zapisywanie...' : 'Dodaj wybrane'}
          </button>
        </div>
      </fieldset>
      <details className="custom-character">
        <summary>
          Dodaj własny znak lub ligaturę <Icon name="plus" />
        </summary>
        <form onSubmit={add}>
          <div className="form-row">
            <label className="grow">
              <span className="field-label">
                {isLigature ? 'Ligatura, np. fi' : 'Znak, np. &'}
                <input
                  className="text-input"
                  value={charValue}
                  onChange={(e) => setCharValue(e.target.value)}
                  required
                  maxLength={isLigature ? 12 : 2}
                />
              </span>
            </label>
            {isLigature && (
              <label className="grow">
                <span className="field-label">Znaki składowe, np. fi</span>
                <input
                  className="text-input"
                  value={componentChars}
                  onChange={(e) => setComponentChars(e.target.value)}
                  required
                />
              </label>
            )}
            <button
              className="button secondary"
              disabled={busy || !charValue.trim()}
            >
              Dodaj znak
            </button>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isLigature}
              onChange={(e) => setIsLigature(e.target.checked)}
            />{' '}
            Ligatura - kilka liter połączonych w jeden glif
          </label>
        </form>
      </details>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div role="status">
        {message && <p className="notice success">{message}</p>}
      </div>
      <div className="section-heading character-heading">
        <h3>
          Twój zestaw <span className="count">{entries.length}</span>
        </h3>
        {entries.length > 0 && (
          <input
            className="text-input character-search"
            aria-label="Filtruj znaki"
            placeholder="Znajdź znak..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      {entries.length ? (
        <ul className="character-grid">
          {entries
            .filter((e) => e.charValue.includes(query))
            .map((entry) => (
              <li key={entry.id} className="character-cell">
                <span>{entry.charValue}</span>
                <button
                  type="button"
                  aria-label={`Usuń znak ${entry.charValue}`}
                  title={`Usuń znak ${entry.charValue}`}
                  disabled={busy}
                  onClick={() => remove(entry)}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          {!entries.some((e) => e.charValue.includes(query)) && (
            <li className="muted">Nie ma takiego znaku.</li>
          )}
        </ul>
      ) : (
        <div className="character-empty">
          <Icon name="type" />
          <p>
            Tu pojawią się Twoje znaki.
            <br />
            <span className="muted">Wybierz zestaw powyżej, aby zacząć.</span>
          </p>
        </div>
      )}
    </div>
  );
}
