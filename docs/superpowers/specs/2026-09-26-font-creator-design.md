# Font Creator - Design

Date: 2026-09-26
Status: Approved

## Purpose

Personal tool (single user) to build a custom handwriting font, similar to calligraphr.com, with one key improvement calligraphr lacks: per-glyph advance width editing after scanning, since auto-detected spacing from scans is often wrong (large horizontal gaps on some characters).

Flow: define character set -> generate printable PDF template -> print, handwrite, scan -> upload scan -> auto-extract glyphs (vectorize) -> review/adjust glyphs (including width) -> build installable font (.otf/.ttf) -> install on macOS.

## Non-goals

- No multi-user / auth / cloud hosting. Local-only, runs via `pnpm dev` on localhost.
- No variable fonts, no multiple weights/styles per project.
- No AI-based vectorization (may be revisited later).

## Architecture

Single Next.js app (Node) for UI and API orchestration, with a Python CLI toolset invoked as subprocesses for image processing and font building (fonttools/OpenCV/potrace are more mature in Python for this domain than Node equivalents).

```
Next.js (UI + API routes)
  |
  |-- SQLite (better-sqlite3): projects, glyph sets, template versions, scans, glyphs, builds
  |-- Filesystem (per project): generated PDFs, uploaded scans, extracted glyph SVGs, built fonts
  |
  '-- Python subprocesses (invoked on demand, not a long-running service):
        align_scan.py    - detect registration markers, perspective/rotation correction
        extract_glyphs.py - crop grid cells, binarize, potrace -> SVG per glyph
        build_font.py     - fonttools: SVG outlines -> glyf, advance widths (with overrides),
                             OpenType GSUB ligatures, font metadata -> .otf/.ttf
```

Each Python step returns JSON (`{ok, error, details}`) via stdout; Node maps failures to actionable UI states (e.g. "registration markers not detected - rescan"). No silent failures - a glyph that fails auto-crop is marked `failed` and requires manual re-crop or a rescan.

## Data model (SQLite)

- `projects`: id, name, created_at, status
- `glyph_set`: id, project_id, char/unicode, type (`single`|`ligature`), component_chars (for ligatures), sort_order
- `template_versions`: id, project_id, grid config (rows/cols/cell size), created_at
- `scans`: id, project_id, template_version_id, file_path, uploaded_at, alignment_status
- `glyphs`: id, glyph_set_id, scan_id, svg_path, bbox_raw, advance_width_override (nullable), left_bearing_override (nullable), status (`pending`|`reviewed`|`approved`|`failed`)
- `builds`: id, project_id, created_at, otf_path, ttf_path, font_metrics (units_per_em, ascender, descender)

`advance_width_override` is the core differentiator from calligraphr: when set, it overrides the auto-detected bbox-derived width at font build time.

## User workflow

1. Create project (name; start from empty character set or a preset).
2. Character-set editor: add/remove single characters and ligatures (arbitrary Unicode chars, ligatures defined by their component chars, e.g. "ti"). Editing the set after a template PDF exists creates a new `template_version`.
3. Generate PDF: grid layout, one character per cell with a faint background label, plus 4 corner registration markers. Multi-page if needed.
4. Print, handwrite, scan (outside the app).
5. Upload scan(s), associated with a `template_version`.
6. Auto-processing (Python): detect markers -> perspective/rotation correction -> crop cells -> binarize -> potrace -> SVG per glyph, with auto bbox and auto advance width.
7. Glyph review: grid of thumbnails; click a glyph to preview and edit advance width (and optionally side bearings) with a live preview showing the glyph next to a neighboring character to visualize spacing. Mark `approved`.
8. Build font: once glyphs are approved, trigger Python build -> fonttools composes outlines, metrics, GSUB ligatures -> .otf/.ttf.
9. Download/install (e.g. open directly in Font Book on macOS).

## Components

**Frontend (Next.js App Router)**
- `ProjectList`, `ProjectDetail`
- `GlyphSetEditor`
- `TemplateGenerator`
- `ScanUploader`
- `GlyphReviewGrid` + `GlyphWidthEditor` (live spacing preview)
- `FontBuildPanel`

**Backend (Node API routes)**
- `projects`, `glyph-sets`, `templates` (PDF generation, e.g. `pdf-lib`)
- `scans` (upload, trigger Python alignment/extraction)
- `glyphs` (CRUD, width/bearing overrides)
- `builds` (trigger Python font build, status)

**Python CLI tools**
- `align_scan.py` (OpenCV: marker detection, perspective transform)
- `extract_glyphs.py` (grid crop, binarize, potrace -> SVG)
- `build_font.py` (fonttools: outlines, metrics, GSUB ligatures, .otf/.ttf output)

## Testing

- Vitest: API route logic (validation, data mapping), PDF generation structure checks.
- Pytest: `align_scan`/`extract_glyphs`/`build_font` against fixture scans - verify expected glyph count and correct advance widths in output font.
- Manual end-to-end pass (print/scan step isn't automatable).

## Tech stack

- Next.js (App Router, TypeScript, strict mode), better-sqlite3
- PDF generation: `pdf-lib`
- Python 3: OpenCV, potrace (via `pypotrace` or CLI `potrace`), fonttools
- Package manager: pnpm (Node side), `uv` (Python side)
