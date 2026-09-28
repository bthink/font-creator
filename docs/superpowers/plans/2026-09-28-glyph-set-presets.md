# Glyph Set Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users apply predefined character-set presets (english, polish, icelandic, digits, basic punctuation, basic math, basic currencies) to a project's `glyph_set` instead of adding every character manually.

**Architecture:** A static preset data module (`src/lib/glyphPresets.ts`), a new bulk-insert DB function + API route that dedupes against existing `glyph_set` rows in one transaction, and a UI addition to `GlyphSetEditor` (preset checkboxes + "Apply selected" button) that calls the bulk route. Fully additive - existing manual add/remove flow is untouched.

**Tech Stack:** Next.js App Router (TypeScript strict), better-sqlite3, Vitest.

## Global Constraints

- Presets are `type: 'single'` only - no ligatures (spec: "too style-specific to standardize").
- Every preset char is exactly one Unicode character (no multi-character strings like `"zł"`).
- Bulk apply must be idempotent: re-applying a preset (or an overlapping one) must never insert duplicate `char_value` rows for the same project.
- No DB schema changes - `glyph_set` table is unchanged.
- Follow existing code patterns: query modules in `src/lib/db/*`, thin API routes, `'use client'` components using `fetch`.

---

### Task 1: Preset data module

**Files:**
- Create: `src/lib/glyphPresets.ts`
- Test: `src/lib/glyphPresets.test.ts`

**Interfaces:**
- Produces: `export type GlyphPreset = { id: string; label: string; chars: string[] }` and `export const GLYPH_PRESETS: GlyphPreset[]` - consumed by Task 4 (UI) directly, and indirectly documents the char lists Task 2/3 tests use as fixtures.

- [ ] **Step 1: Write the failing test**

Create `src/lib/glyphPresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GLYPH_PRESETS } from './glyphPresets';

describe('glyphPresets', () => {
  it('has no duplicate preset ids', () => {
    const ids = GLYPH_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate chars within any single preset', () => {
    for (const preset of GLYPH_PRESETS) {
      expect(new Set(preset.chars).size).toBe(preset.chars.length);
    }
  });

  it('every char is exactly one Unicode code point', () => {
    for (const preset of GLYPH_PRESETS) {
      for (const char of preset.chars) {
        expect(Array.from(char)).toHaveLength(1);
      }
    }
  });

  it('includes the expected preset ids', () => {
    const ids = GLYPH_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual([
      'english',
      'polish',
      'icelandic',
      'digits',
      'basic-punctuation',
      'basic-math',
      'basic-currencies',
    ]);
  });

  it('polish preset includes Polish diacritics in both cases', () => {
    const polish = GLYPH_PRESETS.find((preset) => preset.id === 'polish')!;
    expect(polish.chars).toContain('ł');
    expect(polish.chars).toContain('Ł');
    expect(polish.chars).toContain('ż');
    expect(polish.chars).toContain('Ż');
  });

  it('icelandic preset includes thorn and eth in both cases', () => {
    const icelandic = GLYPH_PRESETS.find((preset) => preset.id === 'icelandic')!;
    expect(icelandic.chars).toContain('þ');
    expect(icelandic.chars).toContain('Þ');
    expect(icelandic.chars).toContain('ð');
    expect(icelandic.chars).toContain('Ð');
  });

  it('digits preset is 0-9', () => {
    const digits = GLYPH_PRESETS.find((preset) => preset.id === 'digits')!;
    expect(digits.chars).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/glyphPresets.test.ts`
Expected: FAIL with `Cannot find module './glyphPresets'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/glyphPresets.ts`:

```ts
export type GlyphPreset = {
  id: string;
  label: string;
  chars: string[];
};

function lowerUpper(chars: string): string[] {
  return [...chars.split(''), ...chars.toUpperCase().split('')];
}

const ENGLISH_BASE = 'abcdefghijklmnopqrstuvwxyz';
const POLISH_DIACRITICS = 'ąćęłńóśźż';
const ICELANDIC_BASE = 'aábdðeéfghiíjklmnoóprstuúvxyýþæö';

export const GLYPH_PRESETS: GlyphPreset[] = [
  {
    id: 'english',
    label: 'English',
    chars: lowerUpper(ENGLISH_BASE),
  },
  {
    id: 'polish',
    label: 'Polish',
    chars: [...lowerUpper(ENGLISH_BASE), ...lowerUpper(POLISH_DIACRITICS)],
  },
  {
    id: 'icelandic',
    label: 'Icelandic',
    chars: lowerUpper(ICELANDIC_BASE),
  },
  {
    id: 'digits',
    label: 'Digits',
    chars: '0123456789'.split(''),
  },
  {
    id: 'basic-punctuation',
    label: 'Basic punctuation',
    chars: ['.', ',', '!', '?', ';', ':', "'", '"', '-', '(', ')', '…'],
  },
  {
    id: 'basic-math',
    label: 'Basic math',
    chars: ['+', '−', '=', '<', '>', '×', '÷', '%', '±', '≠'],
  },
  {
    id: 'basic-currencies',
    label: 'Basic currencies',
    chars: ['$', '€', '£', '¥', '¢'],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/glyphPresets.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/glyphPresets.ts src/lib/glyphPresets.test.ts
git commit -m "feat: add predefined glyph set preset data"
```

---

### Task 2: Bulk dedup-insert DB function

**Files:**
- Modify: `src/lib/db/glyphSets.ts`
- Test: `src/lib/db/glyphSets.test.ts`

**Interfaces:**
- Consumes: existing `GlyphSetEntry` type and `toEntry()` helper already in `src/lib/db/glyphSets.ts`.
- Produces: `export function addGlyphSetEntriesBulk(projectId: number, charValues: string[]): GlyphSetEntry[]` - returns only the newly-inserted entries, in the order they were inserted. Consumed by Task 3 (API route).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/db/glyphSets.test.ts` (append inside the existing `describe('glyphSets', ...)` block, after the existing two `it(...)` cases):

```ts
  it('bulk-inserts only characters not already present, skipping duplicates', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk, listGlyphSetEntries } = await import(
      './glyphSets'
    );
    const project = createProject('Bulk Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    const added = addGlyphSetEntriesBulk(project.id, ['a', 'b', 'c']);

    expect(added.map((entry) => entry.charValue)).toEqual(['b', 'c']);
    expect(added.every((entry) => entry.type === 'single')).toBe(true);
    expect(added.every((entry) => entry.componentChars === null)).toBe(true);
    expect(listGlyphSetEntries(project.id)).toHaveLength(3);
  });

  it('bulk-insert continues sort_order from the current max', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk, listGlyphSetEntries } = await import(
      './glyphSets'
    );
    const project = createProject('Sort Order Test');
    addGlyphSetEntry(project.id, 'x', 'single');
    addGlyphSetEntry(project.id, 'y', 'single');

    addGlyphSetEntriesBulk(project.id, ['z', 'w']);

    const entries = listGlyphSetEntries(project.id);
    expect(entries.map((entry) => entry.charValue)).toEqual(['x', 'y', 'z', 'w']);
    expect(entries.map((entry) => entry.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('bulk-insert with an empty or fully-duplicate list returns an empty array', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk } = await import('./glyphSets');
    const project = createProject('Empty Bulk Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    expect(addGlyphSetEntriesBulk(project.id, [])).toEqual([]);
    expect(addGlyphSetEntriesBulk(project.id, ['a'])).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/db/glyphSets.test.ts`
Expected: FAIL with `addGlyphSetEntriesBulk is not a function` (or similar)

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/db/glyphSets.ts`, after `addGlyphSetEntry`:

```ts
export function addGlyphSetEntriesBulk(projectId: number, charValues: string[]): GlyphSetEntry[] {
  const db = getDb();
  const insertMany = db.transaction((values: string[]): GlyphSetEntry[] => {
    const existing = new Set(
      (
        db
          .prepare('SELECT char_value FROM glyph_set WHERE project_id = ?')
          .all(projectId) as { char_value: string }[]
      ).map((row) => row.char_value),
    );
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM glyph_set WHERE project_id = ?')
      .get(projectId) as { max_order: number };
    let nextOrder = maxOrder.max_order + 1;
    const inserted: GlyphSetEntry[] = [];
    for (const value of values) {
      if (existing.has(value)) continue;
      existing.add(value);
      const result = db
        .prepare(
          'INSERT INTO glyph_set (project_id, char_value, type, component_chars, sort_order) VALUES (?, ?, ?, ?, ?)',
        )
        .run(projectId, value, 'single', null, nextOrder);
      nextOrder += 1;
      const row = db
        .prepare('SELECT * FROM glyph_set WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as GlyphSetRow;
      inserted.push(toEntry(row));
    }
    return inserted;
  });
  return insertMany(charValues);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/db/glyphSets.test.ts`
Expected: PASS (5 tests total in this file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/glyphSets.ts src/lib/db/glyphSets.test.ts
git commit -m "feat: add bulk dedup-insert for glyph set entries"
```

---

### Task 3: Bulk API route

**Files:**
- Create: `src/app/api/projects/[id]/glyph-set/bulk/route.ts`
- Test: `src/app/api/projects/[id]/glyph-set/bulk/route.test.ts`

**Interfaces:**
- Consumes: `addGlyphSetEntriesBulk(projectId, charValues)` from Task 2, `getProject(projectId)` from `@/lib/db/projects` (existing, same pattern as `src/app/api/projects/[id]/glyph-set/route.ts:11`).
- Produces: `POST /api/projects/[id]/glyph-set/bulk` - request body `{ charValues: string[] }`, response `201 { added: GlyphSetEntry[] }` on success, `404 { error: 'project not found' }`, `400 { error: 'charValues must be a non-empty array' }`. Consumed by Task 4 (UI).

- [ ] **Step 1: Write the failing test**

Create `src/app/api/projects/[id]/glyph-set/bulk/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('glyph-set bulk route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyphset-bulk-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyphset-bulk-route', { recursive: true, force: true });
  });

  it('inserts only new characters and returns them', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { POST } = await import('./route');

    const project = createProject('Bulk Route Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    const params = Promise.resolve({ id: String(project.id) });
    const response = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: ['a', 'b', 'c'] }),
      }),
      { params },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.added.map((entry: { charValue: string }) => entry.charValue)).toEqual(['b', 'c']);
  });

  it('returns 404 for a missing project', async () => {
    const { POST } = await import('./route');
    const params = Promise.resolve({ id: '999999' });
    const response = await POST(
      new Request('http://localhost/api/projects/999999/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: ['a'] }),
      }),
      { params },
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when charValues is missing or empty', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { POST } = await import('./route');
    const project = createProject('Bad Body Test');
    const params = Promise.resolve({ id: String(project.id) });

    const missing = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params },
    );
    expect(missing.status).toBe(400);

    const empty = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: [] }),
      }),
      { params },
    );
    expect(empty.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/projects/[id]/glyph-set/bulk/route.test.ts`
Expected: FAIL with `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/projects/[id]/glyph-set/bulk/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { addGlyphSetEntriesBulk } from '@/lib/db/glyphSets';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const body = (await request.json()) as { charValues?: unknown };
  if (!Array.isArray(body.charValues) || body.charValues.length === 0) {
    return NextResponse.json({ error: 'charValues must be a non-empty array' }, { status: 400 });
  }
  const added = addGlyphSetEntriesBulk(projectId, body.charValues as string[]);
  return NextResponse.json({ added }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/projects/[id]/glyph-set/bulk/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/[id]/glyph-set/bulk/route.ts src/app/api/projects/[id]/glyph-set/bulk/route.test.ts
git commit -m "feat: add bulk glyph-set apply API route"
```

---

### Task 4: Preset UI in GlyphSetEditor

**Files:**
- Modify: `src/components/GlyphSetEditor.tsx`

**Interfaces:**
- Consumes: `GLYPH_PRESETS: GlyphPreset[]` from `@/lib/glyphPresets` (Task 1), `POST /api/projects/[id]/glyph-set/bulk` (Task 3) returning `{ added: GlyphSetEntry[] }` where `GlyphSetEntry` matches the local type already declared at `src/components/GlyphSetEditor.tsx:5-10`.
- Produces: no new exports - this is a leaf UI change.

There's no existing component test setup for this file (no `*.test.tsx` under `src/components`), so this task is verified manually per the "Manual verification" step below, matching this codebase's current testing coverage for UI components.

- [ ] **Step 1: Add preset state and the "Presets" section**

Modify `src/components/GlyphSetEditor.tsx`. First, add the import at the top (after the `useState` import):

```tsx
import { GLYPH_PRESETS } from '@/lib/glyphPresets';
```

Then, inside the `GlyphSetEditor` function body, add state right after the existing `useState` declarations (after the `isLigature` state at line 22):

```tsx
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
```

- [ ] **Step 2: Render the presets section in the JSX**

In the same file, insert this block right after the opening `<h2>` heading and before the existing manual-add `<form>` (i.e. right after line 48's `</h2>`):

```tsx
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
```

- [ ] **Step 3: Type check and lint**

Run: `pnpm lint`
Expected: no errors related to `GlyphSetEditor.tsx`

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, open a project page, in the character-set editor:
1. Check "English" and "Digits" boxes, click "Apply selected".
2. Confirm 62 new entries (52 letters + 10 digits) appear in the list below.
3. Click "Apply selected" again with the same two boxes checked - confirm no new entries are added (already-present chars are skipped).
4. Manually add one more character via the existing form - confirm it still works unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/GlyphSetEditor.tsx
git commit -m "feat: add preset selection UI to glyph set editor"
```

---

## Plan Self-Review Notes

- Spec coverage: preset data (Task 1), additive bulk apply with dedup (Task 2+3), combinable multi-preset UI (Task 4) - all spec sections have a task.
- `basic-currencies` drops `"zł"` from the original spec table because it is two Unicode characters and would violate the single-char-per-preset-entry invariant enforced by Task 1's test; `ł` is already available standalone via the `polish` preset.
- Type consistency checked: `GlyphSetEntry`/`GlyphPreset` field names (`charValue`, `componentChars`, `chars`, `label`, `id`) match across Task 1/2/3/4.
