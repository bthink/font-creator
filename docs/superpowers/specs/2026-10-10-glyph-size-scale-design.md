# Glyph size scale

## Problem

A letter can be written noticeably larger or smaller than its neighbors on
the printed template (see screenshot: "C" dwarfs "d" and "f"). There is
currently no way to compensate for this at build time - advance width
controls spacing, not the glyph's own drawn size.

## Goal

Let the user scale an individual glyph's outline up or down on the glyph
review screen, store it per glyph, and apply it at font build time. This
mirrors the existing vertical-offset feature
(`docs/superpowers/specs/2026-10-10-glyph-vertical-offset-design.md`) in
shape and lifecycle.

## Data model

New column on `glyphs`:

```sql
scale_override INTEGER
```

Percent (e.g. `100` = no change), nullable, `NULL` means `100` (no
adjustment). Same self-heal migration approach as `vertical_offset_override`
(`PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`, no new migration
framework).

## Backend

- `src/lib/db/glyphs.ts`
  - `Glyph` gains `scaleOverride: number | null`
  - `toGlyph` maps `scale_override`
  - `updateGlyphOverrides` accepts and persists `scaleOverride`
  - `ApprovedGlyphForBuild` / `listApprovedGlyphsForBuild` include it
- `src/app/api/glyphs/[glyphId]/route.ts` PATCH accepts `scaleOverride`,
  validated as an integer in `[50, 200]`.
- `src/app/api/projects/[id]/builds/route.ts`: spec entries for both
  `glyphs` and `ligatures` gain `size_scale_percent: row.scaleOverride ?? 100`.
- `python/src/font_creator_tools/build_font.py`
  - `svg_to_font_transform(spec)` reads `spec.get("size_scale_percent", 100)`
    and multiplies the base `scale` by `size_scale_percent / 100` before
    building the `Transform`.
  - No change to the translation terms: scaling the `a`/`d` components of
    the `Transform` while leaving `-origin_x * scale` and
    `ASCENDER + vertical_offset` as functions of the *unscaled* `scale`
    would shift the anchor, so the multiplied `scale` must be computed
    first and used everywhere `scale` currently appears in
    `svg_to_font_transform`. This keeps the anchor at the same point
    (cell top edge, left edge at `origin_x`) that vertical offset and
    advance width already assume - the letter grows/shrinks down-right
    from that fixed corner, with no new anchor math needed.

## Frontend

### `GlyphWidthEditor.tsx`

- New state `scale`, initialized from `glyph.scaleOverride ?? 100`,
  included in the dirty check and in the PATCH payload alongside the
  existing fields (one save action, no separate button).
- New range + number input pair, mirroring the existing controls: label
  "Rozmiar", range `50..200`, step `1`, unit "%".
- Main glyph preview (`.glyph-preview img`) gets a live
  `transform: scale(scale / 100)` with `transformOrigin: 'top left'`,
  matching the backend's top-left anchor so the on-screen preview tracks
  what the build will actually produce.
- Comparison strip (`.vertical-compare-strip`) entries - both the current
  glyph's slot and each neighbor's slot - gain the same
  `scale(...)` transform combined with the existing `translateY(...)`,
  using the live `scale` value for the current glyph and
  `neighbor.scaleOverride ?? 100` for neighbors, so the strip stays an
  accurate comparison once size is also adjustable.
- `GlyphNeighbor` type gains `scaleOverride: number | null`.

### `GlyphReviewGrid.tsx`

`neighborsFor` includes `scaleOverride` in the mapped neighbor object
(same source field already available on `GlyphWithChar`).

## Testing

- `python/tests/test_build_font.py`: assert that a nonzero
  `size_scale_percent` scales the resulting glyph's outline bounds by the
  expected factor relative to a 100%-scale build, with the top-left
  corner held fixed (an unscaled reference point's font coordinates stay
  the same across both builds).
- `src/lib/db/glyphs.test.ts`: round-trip `scaleOverride` through
  `updateGlyphOverrides`.
- No new e2e coverage - exercised manually via the existing glyph review
  flow.

## Out of scope

- No automatic advance-width adjustment when size changes - width stays a
  separate, independently-edited value.
- No non-uniform (x vs y) scaling.
- No global/default scale, no bulk adjustment.
