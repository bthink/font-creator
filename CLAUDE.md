# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Local, single-user tool that turns handwriting into an installable macOS font (`.otf`/`.ttf`), similar to calligraphr.com but with per-glyph advance-width editing after scanning. No auth, no multi-user, no cloud hosting - runs via `pnpm dev` on localhost only.

Design doc: `docs/superpowers/specs/2026-09-26-font-creator-design.md`
Implementation plan: `docs/superpowers/plans/2026-09-26-font-creator-implementation.md`

## Commands

Node/Next side:
```bash
pnpm install
pnpm dev              # localhost:3000
pnpm build
pnpm lint
pnpm test             # vitest run, all tests
pnpm test -- path/to/file.test.ts        # single file
pnpm test -- -t "test name"              # single test by name
```

Python side (image processing / font building), run from `python/`:
```bash
uv sync
uv run pytest
uv run pytest tests/test_align_scan.py   # single file
uv run pytest tests/test_align_scan.py::test_name  # single test
```

System dependency: `brew install potrace` (invoked as CLI by `extract_glyphs.py`).

E2e tests live in `e2e/` (`full-flow.test.ts`), separate from the co-located `*.test.ts` unit/integration tests under `src/`.

## Architecture

Next.js app (App Router, TypeScript strict) is the only long-running process. It orchestrates two other pieces on demand - there is no separate backend service:

```
Next.js (UI + API routes)
  |
  |-- SQLite (better-sqlite3), src/lib/db/*  - projects, glyph_set, template_versions, scans, glyphs, builds
  |-- Filesystem (DATA_DIR)                  - generated PDFs, uploaded scans, extracted glyph SVGs, built fonts
  |
  '-- Python subprocesses (spawned per call via src/lib/python/runPython.ts, cwd=python/, `uv run python -m <module>`)
        align_scan.py     - registration marker detection, perspective/rotation correction
        extract_glyphs.py - grid-cell crop, binarize, potrace -> SVG per glyph
        build_font.py     - fonttools: SVG outlines -> glyf, advance widths (with overrides), GSUB ligatures, .otf/.ttf
```

Each Python tool prints one JSON line (`{ok, error, details}`) as its last stdout line; `runPythonTool` in `src/lib/python/runPython.ts` parses only that last line and rejects on spawn error, empty output, or bad JSON. Node maps `ok:false` to actionable UI states (e.g. "registration markers not detected - rescan"). No silent failures: a glyph that fails auto-crop is marked `failed`, requiring manual re-crop or rescan.

**Data flow / lifecycle**: character-set edits create a new `template_version` if a PDF already exists for the project -> PDF generated (`src/lib/pdf/generateTemplate.ts`, pdf-lib) -> printed/handwritten/scanned outside the app -> scan uploaded and tied to a `template_version` -> `align_scan.py` then `extract_glyphs.py` populate `glyphs` rows (one per glyph_set entry x scan) with `bbox_raw` and a `svg_path`, status starts `pending` -> user reviews/edits `advance_width_override`/`left_bearing_override` in `GlyphReviewGrid`/`GlyphWidthEditor`, marks `approved` -> `build_font.py` composes only approved glyphs into a `builds` row (`otf_path`/`ttf_path`/`font_metrics`).

`advance_width_override` is the key differentiator from calligraphr: when set, it overrides the auto-detected bbox-derived width at build time.

**DB access pattern**: `src/lib/db.ts` exports a lazy singleton `getDb()` that applies `src/lib/db/schema.sql` on first call (WAL mode, foreign keys on). Table-specific query modules live in `src/lib/db/{projects,glyphSets,scans,glyphs,builds,templateVersions}.ts` - add new queries there, not inline in routes.

**API routes** (`src/app/api/**/route.ts`) are thin: validate input, call a `src/lib/db/*` module and/or `runPythonTool`, shape the JSON response. Route folder nesting mirrors the entity hierarchy (project -> glyph-set/scans/builds -> glyph).

**Frontend components** (`src/components/*.tsx`) map 1:1 to workflow steps: `TemplateGenerator`, `ScanUploader`, `GlyphSetEditor`, `GlyphReviewGrid` + `GlyphWidthEditor` (live spacing preview), `FontBuildPanel`.

`DATA_DIR` env var (see `.env.example`) controls where the SQLite file and project filesystem assets live; defaults to `./data`.
