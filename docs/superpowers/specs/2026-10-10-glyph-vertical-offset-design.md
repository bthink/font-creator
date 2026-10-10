# Glyph vertical offset

## Problem

Handwriting ink lands at slightly different vertical positions within each
grid cell. `extract_glyphs.py` crops each cell to a fixed size and
`build_font.py` always anchors the top of that cell to `ASCENDER` (y=800),
so there is no way to compensate for a letter whose ink sits noticeably
higher or lower than its neighbors - it ends up visibly too high or too low
in words built from the final font (see screenshots: "a" and "e" sitting
below the rest of the word).

## Goal

Let the user nudge an individual glyph's vertical position on the glyph
review screen, store it per glyph, and apply it at font build time.

## Data model

New column on `glyphs`:

```sql
vertical_offset_override INTEGER
```

Font units (1000 units/em), nullable, `NULL` means 0 (no adjustment).
Mirrors `advance_width_override` in shape and lifecycle - set together with
the width override when the user saves the glyph card, cleared never
(always overwritable).

## Backend

- `src/lib/db/glyphs.ts`
  - `Glyph` gains `verticalOffsetOverride: number | null`
  - `toGlyph` maps `vertical_offset_override`
  - `updateGlyphOverrides` accepts and persists `verticalOffsetOverride`
  - `ApprovedGlyphForBuild` / `listApprovedGlyphsForBuild` include it
- `src/app/api/glyphs/[id]/route.ts` PATCH accepts `verticalOffsetOverride`
  in the request body, validated as an integer in `[-150, 150]` (same
  range as the UI slider), passed through to `updateGlyphOverrides`.
- `src/app/api/projects/[id]/builds/route.ts`: spec entries for both
  `glyphs` and `ligatures` gain `vertical_offset: row.verticalOffsetOverride ?? 0`.
- `python/src/font_creator_tools/build_font.py`
  - `svg_to_font_transform(spec)` reads `spec.get("vertical_offset", 0)`
    and adds it to the `ty` component: `ASCENDER + vertical_offset`.
  - Positive offset moves the glyph up (matches font y-up convention).

## Frontend

### `GlyphReviewGrid.tsx`

Computes up to 4 neighbor glyphs for each card from the already-sorted
`items` array (sorted by `glyph_set.sort_order`, same order the grid
renders in): up to 2 before and 2 after the current glyph's index,
skipping any without a usable preview (`svgPath` present, not `failed`).
Passes `neighbors: GlyphWithChar[]` to `GlyphWidthEditor`.

### `GlyphWidthEditor.tsx`

- New state `verticalOffset`, initialized from
  `glyph.verticalOffsetOverride ?? 0`, included in the dirty check and in
  the PATCH payload alongside `advanceWidthOverride` and `status`
  (single save action, no separate save button).
- New range + number input pair, mirroring the existing width controls:
  label "Pozycja w pionie", range `-150..150`, step `1`.
- New "comparison strip": current glyph plus its neighbors rendered at
  natural cell proportions in a row, each with a `translateY` computed
  from its vertical offset (live slider value for the current glyph,
  stored value for neighbors), plus a dashed horizontal reference line
  overlaid across the strip.
  - Conversion from font units to preview pixels mirrors the existing
    `previewScale` used for the width spacing preview:
    `previewOffsetPx = offsetUnits * (SCAN_DPI / FONT_UNITS_PER_EM) * previewScale`
  - CSS: `transform: translateY(-previewOffsetPx)` (positive offset = up
    in the font = up on screen, hence the negation for a y-down CSS axis).
  - Preview images are the full-cell crops already served by
    `/api/glyphs/:id/preview` (same endpoint used elsewhere), so they
    share one coordinate frame and stacking them with no extra alignment
    logic is correct by construction.
- Neighbors without an own override simply render at offset 0.

## Testing

- `python/tests/test_build_font.py`: assert that a nonzero
  `vertical_offset` shifts the resulting glyph's outline y-coordinates by
  the expected amount relative to a zero-offset build.
- `src/lib/db/glyphs.test.ts`: round-trip `verticalOffsetOverride` through
  `updateGlyphOverrides`.
- No new e2e coverage - within scope of existing glyph review e2e flow,
  exercised manually.

## Out of scope

- No global/default offset, no per-row (grid row) bulk adjustment.
- No change to how `extract_glyphs.py` crops cells.
- No visual indicator elsewhere (e.g. project summary) showing how many
  glyphs have a nonzero offset.
