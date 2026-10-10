# Glyph Size Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user scale an individual glyph's drawn outline up or down on the glyph review screen, persist it, and apply it when the font is built, so a letter that was written noticeably larger or smaller than its neighbors no longer stands out in the finished font.

**Architecture:** Add a nullable `scale_override` column (percent, 100 = no change) on `glyphs`, mirroring the existing `vertical_offset_override` column added by the prior glyph-vertical-offset feature (same self-heal migration, same PATCH/build-spec/Python wiring shape). On the review screen, add a third slider next to width and vertical position, live-scaling the preview image with `transform: scale()` anchored at the top-left corner (matching where the build-time transform already anchors origin_x and the cell top), and extend the existing neighbor comparison strip to scale each slot by its own stored value too.

**Tech Stack:** Next.js (TypeScript, strict), better-sqlite3, fontTools (Python), Vitest, pytest.

## Global Constraints

- Scale range: integer percent, `50..200` (50% = half size, 200% = double size, 100% = unchanged).
- `NULL` in the DB means an effective scale of `100`.
- No new migration framework — self-heal the column on an existing on-disk SQLite file via `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`, same pattern as `vertical_offset_override` in `src/lib/db.ts`.
- The scaled transform must multiply the base `scale` value itself (not add a separate scale step) so the existing `-origin_x * scale` and `ASCENDER + vertical_offset` terms stay anchored at the same corner (cell top-left) — see Task 3 for the exact mechanism.
- No change to advance width — it stays an independently-edited value.
- Follow existing code style: no comments except where a non-obvious invariant needs explaining.

---

### Task 1: DB column, self-healing migration, and `glyphs.ts` plumbing

**Files:**
- Modify: `src/lib/db/schema.sql`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db/glyphs.ts`
- Test: `src/lib/db.test.ts`
- Test: `src/lib/db/glyphs.test.ts`

**Interfaces:**
- Produces: `Glyph.scaleOverride: number | null`, `updateGlyphOverrides(id, { scaleOverride?, ... })`, `ApprovedGlyphForBuild.scaleOverride: number | null`, `listApprovedGlyphsForBuild` rows carrying it.

- [ ] **Step 1: Write the failing DB self-heal test**

Add a new test to `src/lib/db.test.ts`, inside the existing `describe('getDb', ...)` block, after the `vertical_offset_override` self-heal test:

```ts
  it('adds scale_override to a pre-existing glyphs table that lacks it', async () => {
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
        vertical_offset_override INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    legacyDb.close();

    const { getDb } = await import('./db');
    const db = getDb();
    const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'scale_override')).toBe(true);
  });
```

(`Database`, `fs`, and `path` are already imported at the top of this file from the prior feature's test — no new imports needed.)

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `pnpm test -- src/lib/db.test.ts`
Expected: the existing tests pass, the new one FAILs (`scale_override` not found) because the legacy table predates the migration and `CREATE TABLE IF NOT EXISTS` in `schema.sql` is a no-op against it.

- [ ] **Step 3: Add the column to the schema and extend the self-heal migration**

In `src/lib/db/schema.sql`, add the column to the `glyphs` table definition (right after `vertical_offset_override`):

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
  scale_override INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'failed'))
);
```

In `src/lib/db.ts`, extend the `migrate` function to also self-heal `scale_override`:

```ts
function migrate(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(glyphs)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'vertical_offset_override')) {
    db.exec('ALTER TABLE glyphs ADD COLUMN vertical_offset_override INTEGER');
  }
  if (!columns.some((column) => column.name === 'scale_override')) {
    db.exec('ALTER TABLE glyphs ADD COLUMN scale_override INTEGER');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/db.test.ts`
Expected: all three tests PASS (connection test, vertical-offset self-heal, scale self-heal).

- [ ] **Step 5: Write the failing `glyphs.ts` round-trip test**

Add to `src/lib/db/glyphs.test.ts`, inside the existing `describe('glyphs', ...)` block, after the "updates and returns the vertical offset override" test:

```ts
  it('updates and returns the scale override', async () => {
    const { createGlyph, updateGlyphOverrides, getGlyph } = await import('./glyphs');
    const { entry, scan } = await setup();

    const glyph = createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 10]);
    expect(glyph.scaleOverride).toBeNull();

    const updated = updateGlyphOverrides(glyph.id, { scaleOverride: 150 });

    expect(updated?.scaleOverride).toBe(150);
    expect(getGlyph(glyph.id)?.scaleOverride).toBe(150);
  });
```

Also extend the existing "lists only approved glyphs joined with glyph_set for build" test to assert the new field is carried through — change:

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

to:

```ts
    const approved = createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 20]);
    updateGlyphOverrides(approved.id, {
      status: 'approved',
      advanceWidthOverride: 500,
      verticalOffsetOverride: 25,
      scaleOverride: 120,
    });

    createGlyph(entry.id, scan.id, '/path/to/b.svg', [0, 0, 10, 20]);

    const rows = listApprovedGlyphsForBuild(entry.projectId);

    expect(rows).toHaveLength(1);
    expect(rows[0].charValue).toBe(entry.charValue);
    expect(rows[0].type).toBe('single');
    expect(rows[0].svgPath).toBe('/path/to/a.svg');
    expect(rows[0].advanceWidthOverride).toBe(500);
    expect(rows[0].verticalOffsetOverride).toBe(25);
    expect(rows[0].scaleOverride).toBe(120);
    expect(rows[0].bboxRaw).toEqual([0, 0, 10, 20]);
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- src/lib/db/glyphs.test.ts`
Expected: FAIL — `scaleOverride` is `undefined`, not `null`/`150`/`120` (type doesn't carry the field yet).

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
  scaleOverride: number | null;
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
  scale_override: number | null;
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
    scaleOverride: row.scale_override,
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
    scaleOverride?: number;
    status?: Glyph['status'];
  },
): Glyph | undefined {
  const db = getDb();
  const current = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(glyphId) as GlyphRow | undefined;
  if (!current) return undefined;

  db.prepare(
    'UPDATE glyphs SET advance_width_override = ?, left_bearing_override = ?, vertical_offset_override = ?, scale_override = ?, status = ? WHERE id = ?',
  ).run(
    overrides.advanceWidthOverride ?? current.advance_width_override,
    overrides.leftBearingOverride ?? current.left_bearing_override,
    overrides.verticalOffsetOverride ?? current.vertical_offset_override,
    overrides.scaleOverride ?? current.scale_override,
    overrides.status ?? current.status,
    glyphId,
  );

  return toGlyph({
    ...current,
    advance_width_override: overrides.advanceWidthOverride ?? current.advance_width_override,
    left_bearing_override: overrides.leftBearingOverride ?? current.left_bearing_override,
    vertical_offset_override: overrides.verticalOffsetOverride ?? current.vertical_offset_override,
    scale_override: overrides.scaleOverride ?? current.scale_override,
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
  scaleOverride: number | null;
};

type ApprovedGlyphForBuildRow = {
  char_value: string;
  type: 'single' | 'ligature';
  component_chars: string | null;
  svg_path: string;
  bbox_raw: string;
  advance_width_override: number | null;
  vertical_offset_override: number | null;
  scale_override: number | null;
};

export function listApprovedGlyphsForBuild(projectId: number): ApprovedGlyphForBuild[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT glyph_set.char_value, glyph_set.type, glyph_set.component_chars,
              glyphs.svg_path, glyphs.bbox_raw, glyphs.advance_width_override,
              glyphs.vertical_offset_override, glyphs.scale_override
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
    scaleOverride: row.scale_override,
  }));
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test -- src/lib/db/glyphs.test.ts src/lib/db.test.ts`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/schema.sql src/lib/db.ts src/lib/db/glyphs.ts src/lib/db.test.ts src/lib/db/glyphs.test.ts
git commit -m "feat: add scale override to glyphs"
```

---

### Task 2: `/api/glyphs/[glyphId]` PATCH validation

**Files:**
- Modify: `src/app/api/glyphs/[glyphId]/route.ts`
- Modify: `src/app/api/glyphs/[glyphId]/route.test.ts`

**Interfaces:**
- Consumes: `updateGlyphOverrides` from Task 1 (now accepts `scaleOverride`).
- Produces: PATCH accepts `scaleOverride` in the JSON body, validated as an integer in `[50, 200]`.

- [ ] **Step 1: Write the failing route tests**

Add to the existing `describe('glyph PATCH route', ...)` block in `src/app/api/glyphs/[glyphId]/route.test.ts`, after the existing vertical-offset tests:

```ts
  it('saves a valid scale override', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ scaleOverride: 150, status: 'approved' }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(200);
    const { getGlyph } = await import('@/lib/db/glyphs');
    expect(getGlyph(glyph.id)?.scaleOverride).toBe(150);
  });

  it('rejects a scale outside 50..200', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ scaleOverride: 201 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a non-integer scale', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ scaleOverride: 99.5 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });
```

(This file already has `setup()` and `patchRequest(...)` helpers from the vertical-offset tests — reuse them, don't redefine.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/app/api/glyphs/\[glyphId\]/route.test.ts`
Expected: the "saves a valid scale override" test actually PASSes already (nothing currently rejects unknown fields, and `updateGlyphOverrides` from Task 1 already persists it) — but the two rejection tests FAIL (currently return 200, not 400) since there's no validation for `scaleOverride` yet.

- [ ] **Step 3: Add validation in the route**

In `src/app/api/glyphs/[glyphId]/route.ts`, add a new check after the existing `verticalOffsetOverride` validation block and before the `status` validation block:

```ts
  if (
    body.scaleOverride !== undefined &&
    (!Number.isInteger(body.scaleOverride) ||
      body.scaleOverride < 50 ||
      body.scaleOverride > 200)
  )
    return NextResponse.json(
      { error: 'Rozmiar musi być liczbą całkowitą od 50 do 200.' },
      { status: 400 },
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/app/api/glyphs/\[glyphId\]/route.test.ts`
Expected: all tests PASS (6 total: 3 from vertical offset, 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/glyphs/\[glyphId\]/route.ts src/app/api/glyphs/\[glyphId\]/route.test.ts
git commit -m "feat: validate scale override in glyph PATCH route"
```

---

### Task 3: `build_font.py` size scale support

**Files:**
- Modify: `python/src/font_creator_tools/build_font.py`
- Test: `python/tests/test_build_font.py`

**Interfaces:**
- Consumes: spec entries (dicts) that may carry `size_scale_percent` (int, percent, default 100).
- Produces: `svg_to_font_transform(spec)` now multiplies the base `scale` by `size_scale_percent / 100` before building the `Transform`, so the top-left anchor (cell top, `origin_x`) stays fixed regardless of the scale factor.

- [ ] **Step 1: Write the failing test**

Add to `python/tests/test_build_font.py`, after `test_vertical_offset_shifts_glyph_outline_in_font_units`:

```python
def test_size_scale_percent_scales_glyph_outline_around_top_left_anchor():
    import cv2
    import numpy as np
    from font_creator_tools.extract_glyphs import trace_to_svg

    with tempfile.TemporaryDirectory() as tmp_dir:
        cell = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.rectangle(cell, (20, 20), (40, 50), (0, 0, 0), -1)
        svg_path = os.path.join(tmp_dir, "scan.svg")
        trace_to_svg(cell, svg_path)

        base_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20}]}
        scaled_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20, "size_scale_percent": 200}]}

        base_otf, base_ttf = os.path.join(tmp_dir, "base.otf"), os.path.join(tmp_dir, "base.ttf")
        scaled_otf, scaled_ttf = os.path.join(tmp_dir, "scaled.otf"), os.path.join(tmp_dir, "scaled.ttf")

        build_font(base_spec, base_otf, base_ttf, "Base test")
        build_font(scaled_spec, scaled_otf, scaled_ttf, "Scaled test")

        base_glyph = TTFont(base_ttf)["glyf"]["a"]
        scaled_glyph = TTFont(scaled_ttf)["glyf"]["a"]

        # origin_x maps to xMin=0 regardless of scale (left edge anchor unchanged).
        assert base_glyph.xMin == 0
        assert scaled_glyph.xMin == 0
        # The cell's top edge (SVG y=0) maps to font y=ASCENDER regardless of
        # scale (top anchor unchanged); yMax is close to ASCENDER for both,
        # and doubling the scale roughly doubles the outline's width and height.
        assert scaled_glyph.xMax == 2 * base_glyph.xMax
        base_height = base_glyph.yMax - base_glyph.yMin
        scaled_height = scaled_glyph.yMax - scaled_glyph.yMin
        assert scaled_height == 2 * base_height
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && uv run pytest tests/test_build_font.py::test_size_scale_percent_scales_glyph_outline_around_top_left_anchor -v`
Expected: FAIL — `scaled_glyph.xMax` equals `base_glyph.xMax` (no scaling applied yet), not double it.

- [ ] **Step 3: Implement the scale in `svg_to_font_transform`**

In `python/src/font_creator_tools/build_font.py`, change:

```python
def svg_to_font_transform(spec: dict[str, Any]) -> Transform:
    base_scale = spec.get("scale", 1)
    size_scale_percent = spec.get("size_scale_percent", 100)
    scale = base_scale * (size_scale_percent / 100)
    origin_x = spec.get("origin_x", 0)
    vertical_offset = spec.get("vertical_offset", 0)
    return Transform(scale, 0, 0, -scale, -origin_x * scale, ASCENDER + vertical_offset)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python && uv run pytest tests/test_build_font.py -v`
Expected: all PASS, including the pre-existing `test_traced_scan_uses_font_units_and_correct_orientation` and `test_vertical_offset_shifts_glyph_outline_in_font_units` (neither sets `size_scale_percent`, defaults to 100, unaffected — `100/100 = 1.0` leaves `scale` unchanged).

- [ ] **Step 5: Commit**

```bash
cd python && git add src/font_creator_tools/build_font.py tests/test_build_font.py
git commit -m "feat: apply per-glyph size scale in font build transform"
```

---

### Task 4: Wire `size_scale_percent` into the build spec from the API route

**Files:**
- Modify: `src/app/api/projects/[id]/builds/route.ts`
- Test: `src/app/api/projects/[id]/builds/route.test.ts`

**Interfaces:**
- Consumes: `ApprovedGlyphForBuild.scaleOverride` from Task 1.
- Produces: spec written to disk includes `size_scale_percent` on every `glyphs`/`ligatures` entry, consumed by Task 3's Python code.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/projects/[id]/builds/route.test.ts`, as a new `it` inside the `describe` block, after the vertical-offset test added by the prior feature:

```ts
  it('includes the scale override in the build spec', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { POST } = await import('./route');

    const project = createProject('Scale override test');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-builds-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPath = path.join(svgDir, 's.svg');
    fs.writeFileSync(svgPath, SVG);

    const entry = addGlyphSetEntry(project.id, 's', 'single');
    const glyph = createGlyph(entry.id, scan.id, svgPath, [0, 0, 100, 100]);
    updateGlyphOverrides(glyph.id, { status: 'approved', advanceWidthOverride: 600, scaleOverride: 150 });

    const params = Promise.resolve({ id: String(project.id) });
    await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }), { params });

    const buildDir = path.resolve('./data-test-builds-route', 'projects', String(project.id), 'builds');
    const specFile = fs.readdirSync(buildDir).find((f) => f.startsWith('spec-'));
    const spec = JSON.parse(fs.readFileSync(path.join(buildDir, specFile!), 'utf-8'));
    expect(spec.glyphs[0].size_scale_percent).toBe(150);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/projects/\[id\]/builds/route.test.ts`
Expected: FAIL — `spec.glyphs[0].size_scale_percent` is `undefined`.

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
      size_scale_percent: row.scaleOverride ?? 100,
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
      size_scale_percent: row.scaleOverride ?? 100,
    }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/projects/\[id\]/builds/route.test.ts`
Expected: all PASS (this test spawns the real Python build tool, so it also re-confirms Task 3 end to end).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/\[id\]/builds/route.ts src/app/api/projects/\[id\]/builds/route.test.ts
git commit -m "feat: pass scale override into the font build spec"
```

---

### Task 5: Size slider + comparison strip scaling in `GlyphWidthEditor`

**Files:**
- Modify: `src/components/GlyphWidthEditor.tsx`
- Modify: `src/components/GlyphReviewGrid.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `glyph.scaleOverride` from Task 1, `neighbor.scaleOverride` (new field on `GlyphNeighbor`, sourced from `GlyphWithChar.scaleOverride` already available via Task 1's `Glyph` type).
- Produces: `GlyphNeighbor` type gains `scaleOverride: number | null`. `onSaved`'s signature gains a fourth argument: `onSaved(status, width, verticalOffset, scale)`.

No automated test — this is a pure rendering/CSS change plus prop wiring, the same shape as the vertical-offset feature's Task 5+6, which also had no dedicated test (verified by typecheck, full suite staying green, and manual verification).

- [ ] **Step 1: Add `scaleOverride` to the `GlyphNeighbor` type**

In `src/components/GlyphWidthEditor.tsx`, update the type near the top of the file:

```ts
export type GlyphNeighbor = {
  id: number;
  charLabel: string;
  svgPath: string | null;
  status: Glyph['status'];
  verticalOffsetOverride: number | null;
  scaleOverride: number | null;
};
```

- [ ] **Step 2: Add scale state and include it in the save payload**

Extend the `onSaved` prop type:

```ts
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
```

After the existing `verticalOffset`/`savedVerticalOffset` state declarations, add:

```ts
  const [scale, setScale] = useState(glyph.scaleOverride ?? 100);
  const [savedScale, setSavedScale] = useState(scale);
```

Update `dirty`:

```ts
  const dirty = width !== savedWidth || verticalOffset !== savedVerticalOffset || scale !== savedScale;
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
```

- [ ] **Step 3: Apply the live scale to the main preview image**

Change the main preview `<img>` block from:

```tsx
      <div className="glyph-preview">
        {glyph.svgPath && !previewFailed ? (
          // Generated SVG is served through a contained, sandboxed endpoint and needs no image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/glyphs/${glyph.id}/preview`}
            alt={`Zeskanowany glif ${charLabel}`}
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <p className="muted">Podgląd niedostępny. Wgraj skan ponownie.</p>
        )}
      </div>
```

to:

```tsx
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
```

- [ ] **Step 4: Add the size slider UI**

After the closing `</div>` of the vertical-offset `width-controls` block (the second one, right before the `{usable && neighbors.length > 0 && (...)}` comparison strip), add:

```tsx
      <label htmlFor={`scale-${glyph.id}`} className="field-label">
        Rozmiar
      </label>
      <div className="width-controls">
        <input
          id={`scale-${glyph.id}`}
          aria-label={`Rozmiar glifu ${charLabel}`}
          type="range"
          min="50"
          max="200"
          value={scale}
          disabled={busy || !usable}
          onChange={(event) => setScale(Number(event.target.value))}
        />
        <input
          className="text-input"
          aria-label={`Dokładny rozmiar glifu ${charLabel} w procentach`}
          type="number"
          min="50"
          max="200"
          value={scale}
          disabled={busy || !usable}
          onChange={(e) => setScale(Number(e.target.value))}
        />
      </div>
```

- [ ] **Step 5: Scale the comparison strip slots**

Change the comparison strip's neighbor and current-glyph `<span>` elements. Replace:

```tsx
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
```

with:

```tsx
          {neighbors
            .filter((neighbor) => neighbor.id !== glyph.id)
            .map((neighbor) => (
              <span
                className="compare-slot"
                key={neighbor.id}
                style={{
                  transform: `translateY(${
                    -(neighbor.verticalOffsetOverride ?? 0) * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale
                  }px) scale(${(neighbor.scaleOverride ?? 100) / 100})`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/glyphs/${neighbor.id}/preview`} alt={`Sąsiedni glif ${neighbor.charLabel}`} />
              </span>
            ))}
          <span
            className="compare-slot current"
            style={{
              transform: `translateY(${-verticalOffset * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale}px) scale(${scale / 100})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/glyphs/${glyph.id}/preview`} alt={`Bieżący glif ${charLabel}`} />
          </span>
```

- [ ] **Step 6: Pass `scaleOverride` from `GlyphReviewGrid`**

In `src/components/GlyphReviewGrid.tsx`, update `neighborsFor`'s mapping:

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
      scaleOverride: item.scaleOverride,
    }));
}
```

Update the `onSaved` callback in the render loop:

```tsx
          {visible.map((glyph) => (
            <GlyphWidthEditor
              key={`${glyph.id}-${glyph.status}`}
              glyph={glyph}
              charLabel={glyph.charLabel}
              neighbors={neighborsFor(items, items.findIndex((item) => item.id === glyph.id))}
              onSaved={(status, width, verticalOffset, scale) =>
                setItems((current) =>
                  current.map((g) =>
                    g.id === glyph.id
                      ? { ...g, status, advanceWidthOverride: width, verticalOffsetOverride: verticalOffset, scaleOverride: scale }
                      : g,
                  ),
                )
              }
            />
          ))}
```

- [ ] **Step 7: No new CSS needed**

The `.compare-slot` and `.glyph-preview img` classes in `src/app/globals.css` already support arbitrary inline `transform`/`transformOrigin` styles (CSS doesn't need a new class for a different `transform` value set inline) — confirm by reading `src/app/globals.css` around the `.glyph-preview img` and `.compare-slot img` rules (search for `.glyph-preview img` and `.compare-slot`) and verify neither sets `transform` or `transform-origin` itself (which would conflict with the inline style). If either does, remove that rule's `transform`/`transform-origin` declaration so the inline style takes effect; otherwise make no CSS changes.

- [ ] **Step 8: Typecheck, lint, run full test suite**

Run: `pnpm lint && pnpm test`
Expected: no type errors, all PASS.

- [ ] **Step 9: Manual verification**

Run: `pnpm dev`, open a project with an uploaded/reviewed scan, go to the "Korekta glifów" step, open a glyph card, drag the "Rozmiar" slider, and confirm:
- the current glyph's image in the main preview box and in the comparison strip scales live from its top-left corner
- neighboring glyphs' images in the comparison strip stay fixed at their own saved scale
- saving persists the value (reload the page, scale should still show)
- building a font (`FontBuildPanel`) still succeeds

- [ ] **Step 10: Commit**

```bash
git add src/components/GlyphWidthEditor.tsx src/components/GlyphReviewGrid.tsx src/app/globals.css
git commit -m "feat: add glyph size scale slider and scale comparison preview"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all PASS, build succeeds.

- [ ] **Step 2: Run the Python test suite**

Run: `cd python && uv run pytest`
Expected: all PASS.

- [ ] **Step 3: Confirm git log is clean and on the feature branch**

Run: `git log --oneline -8 && git status --short`
Expected: 5 feature commits on top of the spec commit, clean working tree, branch `feature/glyph-size-scale`.
