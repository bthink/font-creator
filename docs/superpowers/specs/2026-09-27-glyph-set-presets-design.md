# Glyph set presets - design

GitHub issue: [#12](https://github.com/bthink/font-creator/issues/12)

## Problem

Design doc mentions creating a project "from empty character set or a preset" - presets aren't
implemented. Users must add every character to `glyph_set` manually via `GlyphSetEditor`.

## Goal

Predefined character sets a user can select and apply (additively, still editable after) when
editing a project's `glyph_set`, so common alphabets/symbol sets don't need to be typed one
character at a time.

## Architecture

- **`src/lib/glyphPresets.ts`** - static module, no DB schema change. Exports:
  ```ts
  export type GlyphPreset = { id: string; label: string; chars: string[] };
  export const GLYPH_PRESETS: GlyphPreset[];
  ```
- **`POST /api/projects/[id]/glyph-set/bulk`** - new route. Body: `{ charValues: string[] }`.
  Runs one `better-sqlite3` transaction that inserts only characters not already present in
  `glyph_set` for the project (dedup by `char_value`), all as `type: 'single'`,
  `component_chars: null`, appended after the current max `sort_order`. Returns
  `{ added: GlyphSetEntry[] }` (only the newly inserted rows).
- **`GlyphSetEditor.tsx`** - new "Presets" block above the existing manual-add form: one checkbox
  per preset + an "Apply selected" button. On click: union the `chars` of checked presets
  (deduped), POST to the bulk endpoint, append `added` entries to local state. Existing manual
  add/remove form and its endpoint are unchanged.

## Preset contents

All presets are `type: 'single'` (no ligatures - too style-specific to standardize; users add
ligatures manually via the existing form).

| id | label | chars |
|---|---|---|
| `english` | English | `a-z`, `A-Z` |
| `polish` | Polish | `a-z` + `ąćęłńóśźż`, `A-Z` + `ĄĆĘŁŃÓŚŹŻ` |
| `icelandic` | Icelandic | `a,á,b,d,ð,e,é,f,g,h,i,í,j,k,l,m,n,o,ó,p,r,s,t,u,ú,v,x,y,ý,þ,æ,ö` + uppercase |
| `digits` | Digits | `0-9` |
| `basic-punctuation` | Basic punctuation | `. , ! ? ; : ' " - ( ) …` |
| `basic-math` | Basic math | `+ − = < > × ÷ % ± ≠` |
| `basic-currencies` | Basic currencies | `$ € £ ¥ zł ¢` |

Presets are combinable: the UI allows selecting multiple at once (e.g. `polish` + `digits` +
`basic-punctuation`) and applying them in a single request.

## Data flow

1. User checks one or more preset checkboxes in `GlyphSetEditor`.
2. Clicks "Apply selected".
3. Client unions the checked presets' `chars` arrays, dedupes locally, sends
   `POST /api/projects/[id]/glyph-set/bulk { charValues }`.
4. Server: 404 if project doesn't exist (existing pattern). 400 if `charValues` missing/not an
   array/empty. Otherwise runs the dedup-insert transaction and returns `201` with
   `{ added: GlyphSetEntry[] }`.
5. Client appends `added` to its local `entries` state (same shape as manual add).

This is purely additive: existing manual add/remove flow, `template_versions` generation, and the
`glyph_set` schema are untouched.

## Testing

- `src/lib/glyphPresets.test.ts` - each preset has no duplicate chars, every char is exactly one
  Unicode character, no overlap in `id`s across presets.
- `src/lib/db/glyphSets.test.ts` - new bulk-insert function: inserting a set where some chars
  already exist only inserts and returns the missing ones; sort_order continues from the current
  max.
- Route test (or integration test) for `POST .../glyph-set/bulk`: 404 for missing project, 400 for
  invalid body, 201 + correct `added` list for valid body.
