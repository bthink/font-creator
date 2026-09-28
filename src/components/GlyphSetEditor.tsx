'use client';

import { useState } from 'react';
import { GLYPH_PRESETS } from '@/lib/glyphPresets';

type GlyphSetEntry = {
  id: number;
  charValue: string;
  type: 'single' | 'ligature';
  componentChars: string | null;
};

export function GlyphSetEditor({
  projectId,
  initialEntries,
}: {
  projectId: number;
  initialEntries: GlyphSetEntry[];
}): React.JSX.Element {
  const [entries, setEntries] = useState(initialEntries);
  const [charValue, setCharValue] = useState('');
  const [componentChars, setComponentChars] = useState('');
  const [isLigature, setIsLigature] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

  function togglePreset(presetId: string): void {
    setSelectedPresetIds((current) =>
      current.includes(presetId)
        ? current.filter((id) => id !== presetId)
        : [...current, presetId],
    );
  }

  async function handleApplyPresets(): Promise<void> {
    const charValues = [
      ...new Set(
        GLYPH_PRESETS.filter((preset) => selectedPresetIds.includes(preset.id)).flatMap(
          (preset) => preset.chars,
        ),
      ),
    ];
    if (charValues.length === 0) return;
    const response = await fetch(`/api/projects/${projectId}/glyph-set/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charValues }),
    });
    const { added } = (await response.json()) as { added: GlyphSetEntry[] };
    setEntries([...entries, ...added]);
    setSelectedPresetIds([]);
  }

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch(`/api/projects/${projectId}/glyph-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        charValue,
        type: isLigature ? 'ligature' : 'single',
        componentChars: isLigature ? componentChars : undefined,
      }),
    });
    const entry = (await response.json()) as GlyphSetEntry;
    setEntries([...entries, entry]);
    setCharValue('');
    setComponentChars('');
  }

  async function handleRemove(id: number): Promise<void> {
    await fetch(`/api/projects/${projectId}/glyph-set/${id}`, { method: 'DELETE' });
    setEntries(entries.filter((entry) => entry.id !== id));
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Character set</h2>
      <fieldset className="mt-2 rounded border p-2">
        <legend className="text-sm font-medium">Presets</legend>
        <div className="flex flex-wrap gap-3">
          {GLYPH_PRESETS.map((preset) => (
            <label key={preset.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={selectedPresetIds.includes(preset.id)}
                onChange={() => togglePreset(preset.id)}
              />
              {preset.label}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleApplyPresets}
          disabled={selectedPresetIds.length === 0}
          className="mt-2 rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Apply selected
        </button>
      </fieldset>
      <form onSubmit={handleAdd} className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="char-value" className="block text-sm">
            Character(s)
          </label>
          <input
            id="char-value"
            value={charValue}
            onChange={(event) => setCharValue(event.target.value)}
            className="rounded border px-2 py-1"
            required
          />
        </div>
        {isLigature && (
          <div>
            <label htmlFor="component-chars" className="block text-sm">
              Component characters
            </label>
            <input
              id="component-chars"
              value={componentChars}
              onChange={(event) => setComponentChars(event.target.value)}
              className="rounded border px-2 py-1"
            />
          </div>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={isLigature}
            onChange={(event) => setIsLigature(event.target.checked)}
          />
          Ligature
        </label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-1 rounded border px-2 py-1">
            <span>{entry.charValue}</span>
            <button
              type="button"
              onClick={() => handleRemove(entry.id)}
              aria-label={`Remove ${entry.charValue}`}
              className="text-red-600"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
