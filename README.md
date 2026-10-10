# Font Creator

Local tool to turn your handwriting into an installable macOS font.

## Setup

```bash
pnpm install
brew install potrace
cd python && uv sync && cd ..
```

## Run

```bash
pnpm dev
```

Open http://localhost:3000.

## Workflow

1. Create a project.
2. Add characters and ligatures to the character set.
3. Generate and print the PDF template.
4. Handwrite each character in its cell, scan the page.
5. Upload the scan — it's auto-aligned and glyphs are extracted.
6. Review each glyph, adjust advance width if spacing looks off, approve it.
7. Build the font, download the `.otf`/`.ttf`, double-click to install via Font Book.

## Studio interface

The Polish-language studio guides each project through four steps: character set,
PDF template, scan and review, and font export. The project library supports search
and sorting. The interface adapts to desktop and mobile screens and supports
keyboard navigation and visible operation/error states.

- Upload each PDF page separately and select its page number before uploading.
- If the character set changes, generate and fill a new template. Templates made
  before the studio update also need to be regenerated once so their character
  mapping can be verified.
- Review uses the extracted SVG, with a live repeated-glyph spacing preview.
  Widths are expressed in font units (1000 units per em), and saved explicitly
  with approval. Approval can be undone.
- Old scans showing white letters on black rectangles need to be uploaded again;
  the extractor now traces the ink and flattens SVG transforms before font building.
- The newest approved scan of each character is used for building. Each new build
  receives separate files so earlier downloads remain available.
- The export view supports editable sample text and adjustable preview size.

## Branch workflow

Use `main` for releases, `develop` for integration, and `feature/*` branches created
from `develop` for ongoing work. Commit with English semantic commit messages.
The studio redesign lives on `feature/studio-redesign` until reviewed and merged
into `develop`.

If sandbox restrictions prevent access to uv's default cache, checks can use an
explicit writable cache:

```bash
UV_CACHE_DIR=/tmp/font-creator-uv-cache pnpm test
cd python && UV_CACHE_DIR=/tmp/font-creator-uv-cache uv run pytest
```
