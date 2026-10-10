# Glyph Vertical Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user nudge an individual glyph's vertical position on the glyph review screen, persist it, and apply it when the font is built, so handwriting that lands slightly high/low in its grid cell no longer looks visually misaligned in the finished font.

**Architecture:** Add a nullable `vertical_offset_override` column (font units) on `glyphs`, mirroring the existing `advance_width_override`. Thread it through the DB layer, the glyph PATCH route, and the build spec into `build_font.py`'s SVG→font transform. On the review screen, add a second slider next to the width slider, plus a "compare with neighbors" preview strip that stacks the current glyph and up to 4 neighboring glyphs (all full-cell crops, same coordinate frame) with a shared dashed baseline-reference line, each shifted by its own offset.

**Tech Stack:** Next.js (TypeScript, strict), better-sqlite3, fontTools (Python), Vitest, pytest.

## Global Constraints

- Vertical offset range: integer, `-150..150` font units (1000 units/em), same validation shape as the existing width fields.
- `NULL` in the DB means an effective offset of `0`.
- No new migration framework — self-heal the column on an existing on-disk SQLite file via `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`.
- Preview math must mirror the real build transform: `previewOffsetPx = offsetUnits * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale`, CSS `translateY(-previewOffsetPx)`.
- Follow existing code style: no comments except where a non-obvious invariant needs explaining (this codebase already does this consistently).

---

### Task 1: DB column, self-healing migration, and `glyphs.ts` plumbing

**Files:**
- Modify: `src/lib/db/schema.sql`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db/glyphs.ts`
- Test: `src/lib/db.test.ts`
- Test: `src/lib/db/glyphs.test.ts`

**Interfaces:**
- Produces: `Glyph.verticalOffsetOverride: number | null`, `updateGlyphOverrides(id, { verticalOffsetOverride?, ... })`, `ApprovedGlyphForBuild.verticalOffsetOverride: number | null`, `listApprovedGlyphsForBuild` rows carrying it.

- [ ] **Step 1: Write the failing DB self-heal test**

Add to `src/lib/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

describe('getDb', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test';
  });

  afterEach(() => {
    fs.rmSync('./data-test', { recursive: true, force: true });
  });

  it('creates a database file and returns a working connection', async () => {
    const { getDb } = await import('./db');
    const db = getDb();
    const result = db.prepare('SELECT 1 AS value').get() as { value: number };
    expect(result.value).toBe(1);
  });

  it('adds vertical_offset_override to a pre-existing glyphs table that lacks it', async () => {
    fs.mkdirSync('./data-test', { recursive: true });
    const legacyDb = new Database(path.join('./data-test', 'font-creator.db'));
    legacyDb.exec(`
      CREATE TABLE glyphs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        glyph_set_id INTEGER NOT NULL,
        scan_id INTEGER NOT NULL,
        svg_path TEXT,
        bbox_raw TEXT,
        advance_width_override INTEGER,
        left_bearing_override INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    legacyDb.close();

    const { getDb } = await import('./db');
    const db = getDb();
    const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'vertical_offset_override')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `pnpm test -- src/lib/db.test.ts`
Expected: first test passes, second FAILs (`vertical_offset_override` not found) because the legacy table predates the migration and `CREATE TABLE IF NOT EXISTS` in `schema.sql` is a no-op against it.

- [ ] **Step 3: Add the column to the schema and a self-heal migration**

In `src/lib/db/schema.sql`, add the column to the `glyphs` table definition (right after `left_bearing_override`):

```sql
CREATE TABLE IF NOT EXISTS glyphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  glyph_set_id INTEGER NOT NULL REFERENCES glyph_set(id) ON DELETE CASCADE,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  svg_path TEXT,
  bbox_raw TEXT,
  advance_width_override INTEGER,
  left_bearing_override INTEGER,
  vertical_offset_override INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'failed'))
);
```

In `src/lib/db.ts`, add a migration step after applying the schema:

```ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? './data';

let instance: Database.Database | undefined;

function migrate(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'vertical_offset_override')) {
    db.exec('ALTER TABLE glyphs ADD COLUMN vertical_offset_override INTEGER');
  }
}

export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  instance = new Database(path.join(DATA_DIR, 'font-creator.db'));
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(process.cwd(), 'src/lib/db/schema.sql'), 'utf-8');
  instance.exec(schema);
  migrate(instance);
  return instance;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/db.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Write the failing `glyphs.ts` round-trip test**

Add to `src/lib/db/glyphs.test.ts`, inside the existing `describe('glyphs', ...)` block, after the "updates glyph overrides and status" test:

```ts
  it('updates and returns the vertical offset override', async () => {
    const { createGlyph, updateGlyphOverrides, getGlyph } = await import('./glyphs');
    const { entry, scan } = await setup();

    const glyph = createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 10]);
    expect(glyph.verticalOffsetOverride).toBeNull();

    const updated = updateGlyphOverrides(glyph.id, { verticalOffsetOverride: -40 });

    expect(updated?.verticalOffsetOverride).toBe(-40);
    expect(getGlyph(glyph.id)?.verticalOffsetOverride).toBe(-40);
  });
```

Also extend the existing "lists only approved glyphs joined with glyph_set for build" test to assert the new field is carried through:

```ts
    const approved = createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 20]);
    updateGlyphOverrides(approved.id, { status: 'approved', advanceWidthOverride: 500, verticalOffsetOverride: 25 });

    createGlyph(entry.id, scan.id, '/path/to/b.svg', [0, 0, 10, 20]);

    const rows = listApprovedGlyphsForBuild(entry.projectId);

    expect(rows).toHaveLength(1);
    expect(rows[0].charValue).toBe(entry.charValue);
    expect(rows[0].type).toBe('single');
    expect(rows[0].svgPath).toBe('/path/to/a.svg');
    expect(rows[0].advanceWidthOverride).toBe(500);
    expect(rows[0].verticalOffsetOverride).toBe(25);
    expect(rows[0].bboxRaw).toEqual([0, 0, 10, 20]);
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- src/lib/db/glyphs.test.ts`
Expected: FAIL — `verticalOffsetOverride` is `undefined`, not `null`/`-40`/`25` (type doesn't carry the field yet).

- [ ] **Step 7: Wire the field through `src/lib/db/glyphs.ts`**

Update `Glyph` type:

```ts
export type Glyph = {
  id: number;
  glyphSetId: number;
  scanId: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  leftBearingOverride: number | null;
  verticalOffsetOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};
```

Update `GlyphRow`:

```ts
type GlyphRow = {
  id: number;
  glyph_set_id: number;
  scan_id: number;
  svg_path: string | null;
  bbox_raw: string | null;
  advance_width_override: number | null;
  left_bearing_override: number | null;
  vertical_offset_override: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};
```

Update `toGlyph`:

```ts
function toGlyph(row: GlyphRow): Glyph {
  return {
    id: row.id,
    glyphSetId: row.glyph_set_id,
    scanId: row.scan_id,
    svgPath: row.svg_path,
    bboxRaw: row.bbox_raw ? (JSON.parse(row.bbox_raw) as [number, number, number, number]) : null,
    advanceWidthOverride: row.advance_width_override,
    leftBearingOverride: row.left_bearing_override,
    verticalOffsetOverride: row.vertical_offset_override,
    status: row.status,
  };
}
```

Update `updateGlyphOverrides`:

```ts
export function updateGlyphOverrides(
  glyphId: number,
  overrides: {
    advanceWidthOverride?: number;
    leftBearingOverride?: number;
    verticalOffsetOverride?: number;
    status?: Glyph['status'];
  },
): Glyph | undefined {
  const db = getDb();
  const current = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(glyphId) as GlyphRow | undefined;
  if (!current) return undefined;

  db.prepare(
    'UPDATE glyphs SET advance_width_override = ?, left_bearing_override = ?, vertical_offset_override = ?, status = ? WHERE id = ?',
  ).run(
    overrides.advanceWidthOverride ?? current.advance_width_override,
    overrides.leftBearingOverride ?? current.left_bearing_override,
    overrides.verticalOffsetOverride ?? current.vertical_offset_override,
    overrides.status ?? current.status,
    glyphId,
  );

  return toGlyph({
    ...current,
    advance_width_override: overrides.advanceWidthOverride ?? current.advance_width_override,
    left_bearing_override: overrides.leftBearingOverride ?? current.left_bearing_override,
    vertical_offset_override: overrides.verticalOffsetOverride ?? current.vertical_offset_override,
    status: overrides.status ?? current.status,
  });
}
```

Update `ApprovedGlyphForBuild` type, `ApprovedGlyphForBuildRow` type, and `listApprovedGlyphsForBuild`:

```ts
export type ApprovedGlyphForBuild = {
  charValue: string;
  type: 'single' | 'ligature';
  componentChars: string | null;
  svgPath: string;
  bboxRaw: [number, number, number, number];
  advanceWidthOverride: number | null;
  verticalOffsetOverride: number | null;
};

type ApprovedGlyphForBuildRow = {
  char_value: string;
  type: 'single' | 'ligature';
  component_chars: string | null;
  svg_path: string;
  bbox_raw: string;
  advance_width_override: number | null;
  vertical_offset_override: number | null;
};

export function listApprovedGlyphsForBuild(projectId: number): ApprovedGlyphForBuild[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT glyph_set.char_value, glyph_set.type, glyph_set.component_chars,
              glyphs.svg_path, glyphs.bbox_raw, glyphs.advance_width_override, glyphs.vertical_offset_override
       FROM glyphs
       JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id
       WHERE glyphs.status = 'approved' AND glyph_set.project_id = ?
         AND glyphs.id = (SELECT MAX(latest.id) FROM glyphs latest WHERE latest.glyph_set_id = glyphs.glyph_set_id AND latest.status = 'approved')`,
    )
    .all(projectId) as ApprovedGlyphForBuildRow[];

  return rows.map((row) => ({
    charValue: row.char_value,
    type: row.type,
    componentChars: row.component_chars,
    svgPath: row.svg_path,
    bboxRaw: JSON.parse(row.bbox_raw) as [number, number, number, number],
    advanceWidthOverride: row.advance_width_override,
    verticalOffsetOverride: row.vertical_offset_override,
  }));
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- src/lib/db/glyphs.test.ts src/lib/db.test.ts`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/schema.sql src/lib/db.ts src/lib/db/glyphs.ts src/lib/db.test.ts src/lib/db/glyphs.test.ts
git commit -m "feat: add vertical offset override to glyphs"
```

---

### Task 2: `/api/glyphs/[glyphId]` PATCH validation

**Files:**
- Modify: `src/app/api/glyphs/[glyphId]/route.ts`
- Test: `src/app/api/glyphs/[glyphId]/route.test.ts` (new)

**Interfaces:**
- Consumes: `updateGlyphOverrides` from Task 1 (now accepts `verticalOffsetOverride`).
- Produces: PATCH accepts `verticalOffsetOverride` in the JSON body, validated as an integer in `[-150, 150]`.

- [ ] **Step 1: Write the failing route test**

Create `src/app/api/glyphs/[glyphId]/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { NextRequest } from 'next/server';

describe('glyph PATCH route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyph-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyph-route', { recursive: true, force: true });
  });

  async function setup() {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph } = await import('@/lib/db/glyphs');

    const project = createProject('Route test');
    const entry = addGlyphSetEntry(project.id, 'a', 'single');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    return createGlyph(entry.id, scan.id, '/path/to/glyph.svg', [0, 0, 10, 10]);
  }

  function patchRequest(body: unknown) {
    return new NextRequest('http://localhost/api/glyphs/1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('saves a valid vertical offset override', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ advanceWidthOverride: 500, verticalOffsetOverride: -60, status: 'approved' }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(200);
    const { getGlyph } = await import('@/lib/db/glyphs');
    expect(getGlyph(glyph.id)?.verticalOffsetOverride).toBe(-60);
  });

  it('rejects a vertical offset outside -150..150', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ verticalOffsetOverride: 151 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a non-integer vertical offset', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ verticalOffsetOverride: 1.5 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/glyphs/\[glyphId\]/route.test.ts`
Expected: first test FAILs (route doesn't know the field, but `updateGlyphOverrides` from Task 1 already accepts it passed through unchecked — actually it will PASS since the loop only validates listed fields and anything else passes through unvalidated). The two rejection tests FAIL (currently return 200, not 400) since there's no validation for the new field yet.

- [ ] **Step 3: Add validation in the route**

In `src/app/api/glyphs/[glyphId]/route.ts`, change the validation loop:

```ts
  for (const field of ['advanceWidthOverride', 'leftBearingOverride']) {
    if (
      body[field] !== undefined &&
      (!Number.isInteger(body[field]) || body[field] < 0 || body[field] > 5000)
    )
      return NextResponse.json(
        { error: 'Szerokość musi być liczbą całkowitą od 0 do 5000.' },
        { status: 400 },
      );
  }
  if (
    body.verticalOffsetOverride !== undefined &&
    (!Number.isInteger(body.verticalOffsetOverride) ||
      body.verticalOffsetOverride < -150 ||
      body.verticalOffsetOverride > 150)
  )
    return NextResponse.json(
      { error: 'Pozycja w pionie musi być liczbą całkowitą od -150 do 150.' },
      { status: 400 },
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/glyphs/\[glyphId\]/route.test.ts`
Expected: all 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/glyphs/\[glyphId\]/route.ts src/app/api/glyphs/\[glyphId\]/route.test.ts
git commit -m "feat: validate vertical offset override in glyph PATCH route"
```

---

### Task 3: `build_font.py` vertical offset support

**Files:**
- Modify: `python/src/font_creator_tools/build_font.py`
- Test: `python/tests/test_build_font.py`

**Interfaces:**
- Consumes: spec entries (dicts) that may carry `vertical_offset` (int, font units, default 0).
- Produces: `svg_to_font_transform(spec)` now applies `ASCENDER + vertical_offset` as the y-translation.

- [ ] **Step 1: Write the failing test**

Add to `python/tests/test_build_font.py`:

```python
def test_vertical_offset_shifts_glyph_outline_in_font_units():
    import cv2
    import numpy as np
    from font_creator_tools.extract_glyphs import trace_to_svg

    with tempfile.TemporaryDirectory() as tmp_dir:
        cell = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.rectangle(cell, (20, 20), (40, 50), (0, 0, 0), -1)
        svg_path = os.path.join(tmp_dir, "scan.svg")
        trace_to_svg(cell, svg_path)

        base_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20}]}
        shifted_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20, "vertical_offset": 40}]}

        base_otf, base_ttf = os.path.join(tmp_dir, "base.otf"), os.path.join(tmp_dir, "base.ttf")
        shifted_otf, shifted_ttf = os.path.join(tmp_dir, "shifted.otf"), os.path.join(tmp_dir, "shifted.ttf")

        build_font(base_spec, base_otf, base_ttf, "Base test")
        build_font(shifted_spec, shifted_otf, shifted_ttf, "Shifted test")

        base_glyph = TTFont(base_ttf)["glyf"]["a"]
        shifted_glyph = TTFont(shifted_ttf)["glyf"]["a"]

        assert shifted_glyph.yMin - base_glyph.yMin == 40
        assert shifted_glyph.yMax - base_glyph.yMax == 40
        assert shifted_glyph.xMin == base_glyph.xMin
        assert shifted_glyph.xMax == base_glyph.xMax
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && uv run pytest tests/test_build_font.py::test_vertical_offset_shifts_glyph_outline_in_font_units -v`
Expected: FAIL — `shifted_glyph.yMin - base_glyph.yMin == 0`, not `40` (no `vertical_offset` handling yet).

- [ ] **Step 3: Implement the offset in `svg_to_font_transform`**

In `python/src/font_creator_tools/build_font.py`, change:

```python
def svg_to_font_transform(spec: dict[str, Any]) -> Transform:
    scale = spec.get("scale", 1)
    origin_x = spec.get("origin_x", 0)
    vertical_offset = spec.get("vertical_offset", 0)
    return Transform(scale, 0, 0, -scale, -origin_x * scale, ASCENDER + vertical_offset)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && uv run pytest tests/test_build_font.py -v`
Expected: all PASS, including the pre-existing `test_traced_scan_uses_font_units_and_correct_orientation` (still has no `vertical_offset` key, defaults to 0, unaffected).

- [ ] **Step 5: Commit**

```bash
cd python && git add src/font_creator_tools/build_font.py tests/test_build_font.py
git commit -m "feat: apply per-glyph vertical offset in font build transform"
```

---

### Task 4: Wire `vertical_offset` into the build spec from the API route

**Files:**
- Modify: `src/app/api/projects/[id]/builds/route.ts`
- Test: `src/app/api/projects/[id]/builds/route.test.ts`

**Interfaces:**
- Consumes: `ApprovedGlyphForBuild.verticalOffsetOverride` from Task 1.
- Produces: spec written to disk includes `vertical_offset` on every `glyphs`/`ligatures` entry, consumed by Task 3's Python code.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/projects/[id]/builds/route.test.ts`, as a new `it` inside the `describe` block:

```ts
  it('includes the vertical offset override in the build spec', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { POST } = await import('./route');

    const project = createProject('Vertical offset test');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-builds-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPath = path.join(svgDir, 'v.svg');
    fs.writeFileSync(svgPath, SVG);

    const entry = addGlyphSetEntry(project.id, 'v', 'single');
    const glyph = createGlyph(entry.id, scan.id, svgPath, [0, 0, 100, 100]);
    updateGlyphOverrides(glyph.id, { status: 'approved', advanceWidthOverride: 600, verticalOffsetOverride: -35 });

    const params = Promise.resolve({ id: String(project.id) });
    await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }), { params });

    const buildDir = path.resolve('./data-test-builds-route', 'projects', String(project.id), 'builds');
    const specFile = fs.readdirSync(buildDir).find((f) => f.startsWith('spec-'));
    const spec = JSON.parse(fs.readFileSync(path.join(buildDir, specFile!), 'utf-8'));
    expect(spec.glyphs[0].vertical_offset).toBe(-35);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/projects/\[id\]/builds/route.test.ts`
Expected: FAIL — `spec.glyphs[0].vertical_offset` is `undefined`.

- [ ] **Step 3: Add the field in the route**

In `src/app/api/projects/[id]/builds/route.ts`, update both `.map(...)` calls:

```ts
  const glyphs = rows
    .filter((row) => row.type === 'single')
    .map((row) => ({
      char: row.charValue,
      svg_path: row.svgPath,
      scale: FONT_UNITS_PER_EM / SCAN_DPI,
      origin_x: row.bboxRaw[0],
      advance_width: fallbackAdvanceWidth(row.advanceWidthOverride, row.bboxRaw[2]),
      vertical_offset: row.verticalOffsetOverride ?? 0,
    }));
  const ligatures = rows
    .filter((row) => row.type === 'ligature')
    .map((row) => ({
      chars: row.charValue,
      component_chars: row.componentChars,
      svg_path: row.svgPath,
      scale: FONT_UNITS_PER_EM / SCAN_DPI,
      origin_x: row.bboxRaw[0],
      advance_width: fallbackAdvanceWidth(row.advanceWidthOverride, row.bboxRaw[2]),
      vertical_offset: row.verticalOffsetOverride ?? 0,
    }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/projects/\[id\]/builds/route.test.ts`
Expected: all PASS (this test spawns the real Python build tool, so it also re-confirms Task 3 end to end).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/\[id\]/builds/route.ts src/app/api/projects/\[id\]/builds/route.test.ts
git commit -m "feat: pass vertical offset override into the font build spec"
```

---

### Task 5: Neighbor computation in `GlyphReviewGrid`

**Files:**
- Modify: `src/components/GlyphReviewGrid.tsx`
- Modify: `src/components/GlyphWidthEditor.tsx` (prop + signature only, in this task — UI in Task 6)

**Interfaces:**
- Consumes: `GlyphWithChar[]` (existing `items` state), `GlyphWidthEditor`'s existing `onSaved` callback.
- Produces: `GlyphWidthEditor` gains two new props: `neighbors: GlyphNeighbor[]` and an extended `onSaved(status, width, verticalOffset)` signature. Exports `GlyphNeighbor` type from `GlyphWidthEditor.tsx`:
  ```ts
  export type GlyphNeighbor = {
    id: number;
    charLabel: string;
    svgPath: string | null;
    status: Glyph['status'];
    verticalOffsetOverride: number | null;
  };
  ```

No automated test for this task — it's prop wiring with no new branching logic; covered by the manual verification in Task 6 and by TypeScript strict mode catching signature mismatches.

- [ ] **Step 1: Export the `GlyphNeighbor` type from `GlyphWidthEditor.tsx`**

At the top of `src/components/GlyphWidthEditor.tsx`, after the existing imports, add:

```ts
export type GlyphNeighbor = {
  id: number;
  charLabel: string;
  svgPath: string | null;
  status: Glyph['status'];
  verticalOffsetOverride: number | null;
};
```

- [ ] **Step 2: Extend `GlyphWidthEditor`'s props signature**

Change the function signature (body updated fully in Task 6; for this task, only accept and ignore `neighbors`, and extend `onSaved`):

```tsx
export function GlyphWidthEditor({
  glyph,
  charLabel,
  neighbors,
  onSaved,
}: {
  glyph: Glyph;
  charLabel: string;
  neighbors: GlyphNeighbor[];
  onSaved: (status: Glyph['status'], width: number, verticalOffset: number) => void;
}) {
```

Update the existing `save` function's call to `onSaved` to pass the (still width-only-backed) third argument as `0` for now — Task 6 replaces this with the real value:

```ts
      onSaved(nextStatus, width, 0);
```

- [ ] **Step 3: Compute neighbors in `GlyphReviewGrid` and pass them down**

In `src/components/GlyphReviewGrid.tsx`, import the type and compute neighbors per card:

```tsx
import { GlyphWidthEditor, type GlyphNeighbor } from './GlyphWidthEditor';
```

Add a helper above the component:

```tsx
function neighborsFor(items: GlyphWithChar[], index: number): GlyphNeighbor[] {
  const candidates = [index - 2, index - 1, index + 1, index + 2]
    .filter((i) => i >= 0 && i < items.length)
    .map((i) => items[i]);
  return candidates
    .filter((item) => item.svgPath && item.status !== 'failed')
    .map((item) => ({
      id: item.id,
      charLabel: item.charLabel,
      svgPath: item.svgPath,
      status: item.status,
      verticalOffsetOverride: item.verticalOffsetOverride,
    }));
}
```

Update the render loop to pass `neighbors` and the extended `onSaved`:

```tsx
          {visible.map((glyph) => (
            <GlyphWidthEditor
              key={`${glyph.id}-${glyph.status}`}
              glyph={glyph}
              charLabel={glyph.charLabel}
              neighbors={neighborsFor(items, items.findIndex((item) => item.id === glyph.id))}
              onSaved={(status, width, verticalOffset) =>
                setItems((current) =>
                  current.map((g) =>
                    g.id === glyph.id
                      ? { ...g, status, advanceWidthOverride: width, verticalOffsetOverride: verticalOffset }
                      : g,
                  ),
                )
              }
            />
          ))}
```

- [ ] **Step 4: Typecheck and run existing tests**

Run: `pnpm lint && pnpm test`
Expected: no type errors, all existing tests still PASS (no behavioral test exists yet for `neighborsFor`, but the build must be green before moving on).

- [ ] **Step 5: Commit**

```bash
git add src/components/GlyphReviewGrid.tsx src/components/GlyphWidthEditor.tsx
git commit -m "feat: compute neighbor glyphs for vertical-offset comparison"
```

---

### Task 6: Vertical offset slider + comparison strip UI

**Files:**
- Modify: `src/components/GlyphWidthEditor.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `neighbors: GlyphNeighbor[]` prop and `glyph.verticalOffsetOverride` from Task 5/1.
- Produces: visible UI only — no new exports.

No automated test — this is a pure rendering/CSS change with no business logic branch worth a unit test; verified manually via `pnpm dev` in the final verification task.

- [ ] **Step 1: Add vertical offset state and include it in the save payload**

In `src/components/GlyphWidthEditor.tsx`, after the existing `width`/`savedWidth` state:

```ts
  const [verticalOffset, setVerticalOffset] = useState(glyph.verticalOffsetOverride ?? 0);
  const [savedVerticalOffset, setSavedVerticalOffset] = useState(verticalOffset);
```

Update `dirty`:

```ts
  const dirty = width !== savedWidth || verticalOffset !== savedVerticalOffset;
```

Update `save`:

```ts
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
          status: nextStatus,
        }),
      });
      setStatus(nextStatus);
      setSavedWidth(width);
      setSavedVerticalOffset(verticalOffset);
      onSaved(nextStatus, width, verticalOffset);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 2: Add the slider UI below the existing width controls**

After the closing `</div>` of `width-controls` and before the `{usable && valid && (...spacing-preview...)}` block, add:

```tsx
      <label htmlFor={`voffset-${glyph.id}`} className="field-label">
        Pozycja w pionie
      </label>
      <div className="width-controls">
        <input
          id={`voffset-${glyph.id}`}
          aria-label={`Pozycja w pionie glifu ${charLabel}`}
          type="range"
          min="-150"
          max="150"
          value={verticalOffset}
          disabled={busy || !usable}
          onChange={(event) => setVerticalOffset(Number(event.target.value))}
        />
        <input
          className="text-input"
          aria-label={`Dokładna pozycja w pionie glifu ${charLabel}`}
          type="number"
          min="-150"
          max="150"
          value={verticalOffset}
          disabled={busy || !usable}
          onChange={(e) => setVerticalOffset(Number(e.target.value))}
        />
      </div>
```

- [ ] **Step 3: Add the neighbor comparison strip**

After the vertical offset controls (and before the existing spacing preview block), add:

```tsx
      {usable && neighbors.length > 0 && (
        <div className="vertical-compare-strip" aria-label={`Porównanie pozycji glifu ${charLabel} z sąsiednimi znakami`}>
          <span className="vertical-compare-line" />
          {neighbors
            .filter((neighbor) => neighbor.id !== glyph.id)
            .map((neighbor) => (
              <span
                className="compare-slot"
                key={neighbor.id}
                style={{
                  transform: `translateY(${
                    -(neighbor.verticalOffsetOverride ?? 0) * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale
                  }px)`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/glyphs/${neighbor.id}/preview`} alt={`Sąsiedni glif ${neighbor.charLabel}`} />
              </span>
            ))}
          <span
            className="compare-slot current"
            style={{
              transform: `translateY(${-verticalOffset * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/glyphs/${glyph.id}/preview`} alt={`Bieżący glif ${charLabel}`} />
          </span>
        </div>
      )}
```

- [ ] **Step 4: Import the conversion constants**

At the top of `src/components/GlyphWidthEditor.tsx`, update the import:

```ts
import { detectedAdvanceWidth, FONT_UNITS_PER_EM, SCAN_DPI } from '@/lib/glyphMetrics';
```

- [ ] **Step 5: Add CSS for the comparison strip**

In `src/app/globals.css`, after the `.spacing-preview img { ... }` block (around line 1737), add:

```css
.vertical-compare-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 80px;
  overflow-x: auto;
  padding: 10px 5px;
  margin-top: 14px;
  background: #f7f9f2;
  border: 1px solid #c7d5bb;
}
.vertical-compare-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px dashed #abbf99;
  pointer-events: none;
}
.compare-slot {
  display: block;
  flex-shrink: 0;
  width: 50px;
  height: 60px;
}
.compare-slot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.compare-slot.current img {
  outline: 2px solid var(--green, #4a7c3f);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Typecheck, lint, run full test suite**

Run: `pnpm lint && pnpm test`
Expected: no errors, all PASS.

- [ ] **Step 7: Manual verification**

Run: `pnpm dev`, open a project with an uploaded/reviewed scan, go to the "Korekta glifów" step, open a glyph card, drag the "Pozycja w pionie" slider, and confirm:
- the current glyph's image in the comparison strip moves up/down live
- neighboring glyphs' images stay fixed at their own saved offsets
- saving persists the value (reload the page, offset should still show)
- building a font (`FontBuildPanel`) still succeeds

- [ ] **Step 8: Commit**

```bash
git add src/components/GlyphWidthEditor.tsx src/app/globals.css
git commit -m "feat: add vertical offset slider and neighbor comparison preview"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all PASS, build succeeds.

- [ ] **Step 2: Run the Python test suite**

Run: `cd python && uv run pytest`
Expected: all PASS.

- [ ] **Step 3: Confirm git log is clean and on the feature branch**

Run: `git log --oneline -8 && git status --short`
Expected: 6 feature commits on top of the spec commit, clean working tree, branch `feature/glyph-vertical-offset`.
