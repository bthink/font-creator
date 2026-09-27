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
