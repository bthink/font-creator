# Font Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js app that takes a user-defined character set through PDF template generation, handwriting scan upload, glyph extraction with editable per-glyph advance width, and font building into an installable .otf/.ttf.

**Architecture:** Next.js (TypeScript, App Router) for UI and API routes, backed by SQLite (better-sqlite3) for metadata and the filesystem for binary assets (PDFs, scans, SVGs, fonts). Image processing and font compilation run as Python subprocesses (OpenCV, potrace, fonttools) invoked from Node API routes.

**Tech Stack:** Next.js 15+, TypeScript (strict), better-sqlite3, pdf-lib, Python 3.12 (uv-managed), OpenCV (opencv-python), potrace (CLI), fonttools.

## Global Constraints

- Local-only app: no auth, no external hosting. Runs via `pnpm dev` on localhost.
- TypeScript strict mode everywhere; no `any`.
- `const` over `let`, never `var`.
- No inline styles — Tailwind utility classes.
- Server Components by default; `'use client'` only where interactivity/browser APIs are required.
- No `useEffect` for data fetching.
- Vitest for Node/TS unit and integration tests (`*.test.ts` next to source). Pytest for Python tools.
- Commits: semantic (`feat`, `fix`, `refactor`, `chore`, `docs`), atomic, English messages.
- Package managers: `pnpm` (Node), `uv` (Python).

---

### Task 1: Project scaffolding (Next.js + Python toolchain)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `python/pyproject.toml`
- Create: `src/lib/db.ts`
- Create: `.env.example` (empty — no secrets needed, placeholder for `DATA_DIR`)

**Interfaces:**
- Produces: `getDb(): Database` (better-sqlite3 instance, singleton, from `src/lib/db.ts`), reading DB file path from `DATA_DIR` env var (default `./data`).

- [ ] **Step 1: Scaffold Next.js app**

```bash
pnpm create next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint --use-pnpm --yes
```

- [ ] **Step 2: Enable strict TypeScript**

Edit `tsconfig.json`, ensure `"strict": true` is set (create-next-app defaults to this — verify, don't duplicate).

- [ ] **Step 3: Add Node dependencies**

```bash
pnpm add better-sqlite3 pdf-lib
pnpm add -D @types/better-sqlite3 vitest
```

- [ ] **Step 4: Add `.gitignore` entries**

```
data/
python/.venv/
*.db
```

- [ ] **Step 5: Create `src/lib/db.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR ?? './data';

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  instance = new Database(path.join(DATA_DIR, 'font-creator.db'));
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}
```

- [ ] **Step 6: Write a smoke test for `getDb`**

Create `src/lib/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

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
});
```

- [ ] **Step 7: Add Vitest config and script**

Add to `package.json` scripts: `"test": "vitest run"`. Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 8: Run tests, verify pass**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 9: Scaffold Python toolchain**

```bash
mkdir -p python/font_creator_tools python/tests
cd python && uv init --lib --name font-creator-tools --no-workspace && cd ..
```

Edit `python/pyproject.toml` to add dependencies:

```toml
[project]
name = "font-creator-tools"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "opencv-python>=4.10",
    "fonttools>=4.53",
]

[dependency-groups]
dev = ["pytest>=8.0"]
```

```bash
cd python && uv sync && cd ..
```

Verify `potrace` CLI is available on the system (`which potrace`); if missing, note in README that it must be installed via `brew install potrace` (macOS system dependency, not a Python package).

- [ ] **Step 10: Write a Python smoke test**

Create `python/tests/test_smoke.py`:

```python
def test_imports():
    import cv2
    from fontTools.ttLib import TTFont
    assert cv2.__version__
    assert TTFont
```

Run: `cd python && uv run pytest tests/test_smoke.py -v`
Expected: 1 passed.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app and Python toolchain"
```

---

### Task 2: SQLite schema, migrations, and Projects CRUD

**Files:**
- Create: `src/lib/db/schema.sql`
- Modify: `src/lib/db.ts` (run schema on init)
- Create: `src/lib/db/projects.ts`
- Create: `src/lib/db/projects.test.ts`
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`
- Create: `src/app/page.tsx` (project list, Server Component)
- Create: `src/app/projects/new/page.tsx` (create form, client component for form state)

**Interfaces:**
- Produces (from `src/lib/db/projects.ts`):
  - `type Project = { id: number; name: string; createdAt: string; status: 'active' | 'archived' }`
  - `createProject(name: string): Project`
  - `listProjects(): Project[]`
  - `getProject(id: number): Project | undefined`

- [ ] **Step 1: Write schema file**

Create `src/lib/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS glyph_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  char_value TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'ligature')),
  component_chars TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  grid_config TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_version_id INTEGER NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  alignment_status TEXT NOT NULL DEFAULT 'pending' CHECK (alignment_status IN ('pending', 'aligned', 'failed'))
);

CREATE TABLE IF NOT EXISTS glyphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  glyph_set_id INTEGER NOT NULL REFERENCES glyph_set(id) ON DELETE CASCADE,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  svg_path TEXT,
  bbox_raw TEXT,
  advance_width_override INTEGER,
  left_bearing_override INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'failed'))
);

CREATE TABLE IF NOT EXISTS builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  otf_path TEXT,
  ttf_path TEXT,
  font_metrics TEXT
);
```

- [ ] **Step 2: Load schema on DB init**

Modify `src/lib/db.ts`, after creating `instance`:

```typescript
const schema = fs.readFileSync(path.join(process.cwd(), 'src/lib/db/schema.sql'), 'utf-8');
instance.exec(schema);
```

- [ ] **Step 3: Write failing test for projects module**

Create `src/lib/db/projects.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('projects', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-projects';
  });

  afterEach(() => {
    fs.rmSync('./data-test-projects', { recursive: true, force: true });
  });

  it('creates and lists projects', async () => {
    const { createProject, listProjects } = await import('./projects');
    createProject('My Handwriting');
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('My Handwriting');
    expect(projects[0].status).toBe('active');
  });

  it('gets a project by id', async () => {
    const { createProject, getProject } = await import('./projects');
    const created = createProject('Test Font');
    const found = getProject(created.id);
    expect(found?.name).toBe('Test Font');
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

Run: `pnpm test src/lib/db/projects.test.ts`
Expected: FAIL (module `./projects` not found).

- [ ] **Step 5: Implement `src/lib/db/projects.ts`**

```typescript
import { getDb } from '../db';

export type Project = {
  id: number;
  name: string;
  createdAt: string;
  status: 'active' | 'archived';
};

type ProjectRow = {
  id: number;
  name: string;
  created_at: string;
  status: 'active' | 'archived';
};

function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, createdAt: row.created_at, status: row.status };
}

export function createProject(name: string): Project {
  const db = getDb();
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
  return getProject(Number(result.lastInsertRowid)) as Project;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: number): Project | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}
```

- [ ] **Step 6: Run test, verify it passes**

Run: `pnpm test src/lib/db/projects.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Create API routes**

Create `src/app/api/projects/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/db/projects';

export function GET(): NextResponse {
  return NextResponse.json(listProjects());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { name?: string };
  if (!body.name || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  return NextResponse.json(createProject(body.name.trim()), { status: 201 });
}
```

Create `src/app/api/projects/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';

export function GET(
  _request: Request,
  { params }: { params: { id: string } },
): NextResponse {
  const project = getProject(Number(params.id));
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(project);
}
```

- [ ] **Step 8: Build project list page**

Create `src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { listProjects } from '@/lib/db/projects';

export default function HomePage(): React.JSX.Element {
  const projects = listProjects();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Font Creator</h1>
      <Link href="/projects/new" className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white">
        New project
      </Link>
      <ul className="mt-6 space-y-2">
        {projects.map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="text-blue-600 underline">
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 9: Build new-project form**

Create `src/app/projects/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProjectPage(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const project = (await response.json()) as { id: number };
    router.push(`/projects/${project.id}`);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">New project</h1>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label htmlFor="project-name" className="block text-sm font-medium">
          Project name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          Create
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 10: Manual verification**

Run: `pnpm dev`, open `http://localhost:3000`, create a project, confirm it appears in the list and `/projects/[id]` route returns the project via `GET /api/projects/[id]`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add SQLite schema and projects CRUD"
```

---

### Task 3: Glyph-set editor

**Files:**
- Create: `src/lib/db/glyphSets.ts`
- Create: `src/lib/db/glyphSets.test.ts`
- Create: `src/app/api/projects/[id]/glyph-set/route.ts`
- Create: `src/app/api/projects/[id]/glyph-set/[glyphId]/route.ts`
- Create: `src/components/GlyphSetEditor.tsx`
- Modify: `src/app/projects/[id]/page.tsx` (create — project detail page hosting the editor)

**Interfaces:**
- Consumes: `getProject(id: number)` from Task 2.
- Produces:
  - `type GlyphSetEntry = { id: number; projectId: number; charValue: string; type: 'single' | 'ligature'; componentChars: string | null; sortOrder: number }`
  - `addGlyphSetEntry(projectId: number, charValue: string, type: 'single' | 'ligature', componentChars?: string): GlyphSetEntry`
  - `listGlyphSetEntries(projectId: number): GlyphSetEntry[]`
  - `removeGlyphSetEntry(id: number): void`

- [ ] **Step 1: Write failing tests**

Create `src/lib/db/glyphSets.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('glyphSets', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyphsets';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyphsets', { recursive: true, force: true });
  });

  it('adds and lists single characters and ligatures', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, listGlyphSetEntries } = await import('./glyphSets');
    const project = createProject('Test');
    addGlyphSetEntry(project.id, 'a', 'single');
    addGlyphSetEntry(project.id, 'ti', 'ligature', 'ti');
    const entries = listGlyphSetEntries(project.id);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.type === 'ligature')?.componentChars).toBe('ti');
  });

  it('removes an entry', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, listGlyphSetEntries, removeGlyphSetEntry } = await import('./glyphSets');
    const project = createProject('Test');
    const entry = addGlyphSetEntry(project.id, 'b', 'single');
    removeGlyphSetEntry(entry.id);
    expect(listGlyphSetEntries(project.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `pnpm test src/lib/db/glyphSets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/db/glyphSets.ts`**

```typescript
import { getDb } from '../db';

export type GlyphSetEntry = {
  id: number;
  projectId: number;
  charValue: string;
  type: 'single' | 'ligature';
  componentChars: string | null;
  sortOrder: number;
};

type GlyphSetRow = {
  id: number;
  project_id: number;
  char_value: string;
  type: 'single' | 'ligature';
  component_chars: string | null;
  sort_order: number;
};

function toEntry(row: GlyphSetRow): GlyphSetEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    charValue: row.char_value,
    type: row.type,
    componentChars: row.component_chars,
    sortOrder: row.sort_order,
  };
}

export function addGlyphSetEntry(
  projectId: number,
  charValue: string,
  type: 'single' | 'ligature',
  componentChars?: string,
): GlyphSetEntry {
  const db = getDb();
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM glyph_set WHERE project_id = ?')
    .get(projectId) as { max_order: number };
  const result = db
    .prepare(
      'INSERT INTO glyph_set (project_id, char_value, type, component_chars, sort_order) VALUES (?, ?, ?, ?, ?)',
    )
    .run(projectId, charValue, type, componentChars ?? null, maxOrder.max_order + 1);
  const row = db
    .prepare('SELECT * FROM glyph_set WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as GlyphSetRow;
  return toEntry(row);
}

export function listGlyphSetEntries(projectId: number): GlyphSetEntry[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM glyph_set WHERE project_id = ? ORDER BY sort_order ASC')
    .all(projectId) as GlyphSetRow[];
  return rows.map(toEntry);
}

export function removeGlyphSetEntry(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM glyph_set WHERE id = ?').run(id);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test src/lib/db/glyphSets.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Add API routes**

Create `src/app/api/projects/[id]/glyph-set/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { addGlyphSetEntry, listGlyphSetEntries } from '@/lib/db/glyphSets';

export function GET(
  _request: Request,
  { params }: { params: { id: string } },
): NextResponse {
  return NextResponse.json(listGlyphSetEntries(Number(params.id)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = (await request.json()) as {
    charValue?: string;
    type?: 'single' | 'ligature';
    componentChars?: string;
  };
  if (!body.charValue || !body.type) {
    return NextResponse.json({ error: 'charValue and type are required' }, { status: 400 });
  }
  const entry = addGlyphSetEntry(Number(params.id), body.charValue, body.type, body.componentChars);
  return NextResponse.json(entry, { status: 201 });
}
```

Create `src/app/api/projects/[id]/glyph-set/[glyphId]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { removeGlyphSetEntry } from '@/lib/db/glyphSets';

export function DELETE(
  _request: Request,
  { params }: { params: { glyphId: string } },
): NextResponse {
  removeGlyphSetEntry(Number(params.glyphId));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Build `GlyphSetEditor` client component**

Create `src/components/GlyphSetEditor.tsx`:

```tsx
'use client';

import { useState } from 'react';

type GlyphSetEntry = {
  id: number;
  charValue: string;
  type: 'single' | 'ligature';
  componentChars: string | null;
};

export function GlyphSetEditor({
  projectId,
  initialEntries,
}: {
  projectId: number;
  initialEntries: GlyphSetEntry[];
}): React.JSX.Element {
  const [entries, setEntries] = useState(initialEntries);
  const [charValue, setCharValue] = useState('');
  const [isLigature, setIsLigature] = useState(false);

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch(`/api/projects/${projectId}/glyph-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        charValue,
        type: isLigature ? 'ligature' : 'single',
        componentChars: isLigature ? charValue : undefined,
      }),
    });
    const entry = (await response.json()) as GlyphSetEntry;
    setEntries([...entries, entry]);
    setCharValue('');
  }

  async function handleRemove(id: number): Promise<void> {
    await fetch(`/api/projects/${projectId}/glyph-set/${id}`, { method: 'DELETE' });
    setEntries(entries.filter((entry) => entry.id !== id));
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Character set</h2>
      <form onSubmit={handleAdd} className="mt-2 flex items-end gap-2">
        <div>
          <label htmlFor="char-value" className="block text-sm">
            Character(s)
          </label>
          <input
            id="char-value"
            value={charValue}
            onChange={(event) => setCharValue(event.target.value)}
            className="rounded border px-2 py-1"
            required
          />
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={isLigature}
            onChange={(event) => setIsLigature(event.target.checked)}
          />
          Ligature
        </label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-1 rounded border px-2 py-1">
            <span>{entry.charValue}</span>
            <button
              type="button"
              onClick={() => handleRemove(entry.id)}
              aria-label={`Remove ${entry.charValue}`}
              className="text-red-600"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7: Build project detail page**

Create `src/app/projects/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { GlyphSetEditor } from '@/components/GlyphSetEditor';

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}): React.JSX.Element {
  const project = getProject(Number(params.id));
  if (!project) notFound();
  const entries = listGlyphSetEntries(project.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <GlyphSetEditor projectId={project.id} initialEntries={entries} />
    </main>
  );
}
```

- [ ] **Step 8: Manual verification**

Run `pnpm dev`, open a project page, add a single char and a ligature, remove one, confirm UI updates and `GET /api/projects/[id]/glyph-set` reflects state.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add glyph-set editor for characters and ligatures"
```

---

### Task 4: PDF template generator

**Files:**
- Create: `src/lib/pdf/generateTemplate.ts`
- Create: `src/lib/pdf/generateTemplate.test.ts`
- Create: `src/lib/db/templateVersions.ts`
- Create: `src/app/api/projects/[id]/templates/route.ts`
- Modify: `src/components/GlyphSetEditor.tsx` is unaffected; add `src/components/TemplateGenerator.tsx`
- Modify: `src/app/projects/[id]/page.tsx` (render `TemplateGenerator`)

**Interfaces:**
- Consumes: `listGlyphSetEntries(projectId)` from Task 3.
- Produces:
  - `type GridConfig = { columns: number; rows: number; cellSizePt: number; markerSizePt: number }`
  - `generateTemplatePdf(entries: GlyphSetEntry[], grid: GridConfig): Promise<Uint8Array>`
  - `createTemplateVersion(projectId: number, grid: GridConfig): { id: number; projectId: number; gridConfig: GridConfig; createdAt: string }`

- [ ] **Step 1: Write failing test for PDF generation**

Create `src/lib/pdf/generateTemplate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';

describe('generateTemplatePdf', () => {
  it('creates one page with a cell per character, wrapping to new pages when full', async () => {
    const { generateTemplatePdf } = await import('./generateTemplate');
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: index,
      projectId: 1,
      charValue: String.fromCharCode(97 + index),
      type: 'single' as const,
      componentChars: null,
      sortOrder: index,
    }));
    const bytes = await generateTemplatePdf(entries, {
      columns: 2,
      rows: 2,
      cellSizePt: 100,
      markerSizePt: 10,
    });
    const doc = await PDFDocument.load(bytes);
    // 5 chars, 4 cells per page -> 2 pages
    expect(doc.getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `pnpm test src/lib/pdf/generateTemplate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/pdf/generateTemplate.ts`**

```typescript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { GlyphSetEntry } from '@/lib/db/glyphSets';

export type GridConfig = {
  columns: number;
  rows: number;
  cellSizePt: number;
  markerSizePt: number;
};

const PAGE_MARGIN_PT = 40;

export async function generateTemplatePdf(
  entries: GlyphSetEntry[],
  grid: GridConfig,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cellsPerPage = grid.columns * grid.rows;
  const pageWidth = PAGE_MARGIN_PT * 2 + grid.columns * grid.cellSizePt;
  const pageHeight = PAGE_MARGIN_PT * 2 + grid.rows * grid.cellSizePt;

  for (let pageStart = 0; pageStart < entries.length; pageStart += cellsPerPage) {
    const page = doc.addPage([pageWidth, pageHeight]);
    drawRegistrationMarkers(page, pageWidth, pageHeight, grid.markerSizePt);

    const pageEntries = entries.slice(pageStart, pageStart + cellsPerPage);
    pageEntries.forEach((entry, index) => {
      const col = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const x = PAGE_MARGIN_PT + col * grid.cellSizePt;
      const y = pageHeight - PAGE_MARGIN_PT - (row + 1) * grid.cellSizePt;

      page.drawRectangle({
        x,
        y,
        width: grid.cellSizePt,
        height: grid.cellSizePt,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      });
      page.drawText(entry.charValue, {
        x: x + grid.cellSizePt / 2 - 10,
        y: y + grid.cellSizePt / 2 - 10,
        size: grid.cellSizePt * 0.4,
        font,
        color: rgb(0.85, 0.85, 0.85),
      });
    });
  }

  return doc.save();
}

function drawRegistrationMarkers(
  page: import('pdf-lib').PDFPage,
  pageWidth: number,
  pageHeight: number,
  markerSize: number,
): void {
  const margin = 10;
  const corners = [
    [margin, pageHeight - margin - markerSize],
    [pageWidth - margin - markerSize, pageHeight - margin - markerSize],
    [margin, margin],
    [pageWidth - margin - markerSize, margin],
  ];
  for (const [x, y] of corners) {
    page.drawRectangle({ x, y, width: markerSize, height: markerSize, color: rgb(0, 0, 0) });
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/lib/pdf/generateTemplate.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Add `template_versions` DB module**

Create `src/lib/db/templateVersions.ts`:

```typescript
import { getDb } from '../db';
import type { GridConfig } from '@/lib/pdf/generateTemplate';

export type TemplateVersion = {
  id: number;
  projectId: number;
  gridConfig: GridConfig;
  createdAt: string;
};

type TemplateVersionRow = {
  id: number;
  project_id: number;
  grid_config: string;
  created_at: string;
};

function toTemplateVersion(row: TemplateVersionRow): TemplateVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    gridConfig: JSON.parse(row.grid_config) as GridConfig,
    createdAt: row.created_at,
  };
}

export function createTemplateVersion(projectId: number, grid: GridConfig): TemplateVersion {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO template_versions (project_id, grid_config) VALUES (?, ?)')
    .run(projectId, JSON.stringify(grid));
  const row = db
    .prepare('SELECT * FROM template_versions WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as TemplateVersionRow;
  return toTemplateVersion(row);
}

export function getLatestTemplateVersion(projectId: number): TemplateVersion | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM template_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as TemplateVersionRow | undefined;
  return row ? toTemplateVersion(row) : undefined;
}
```

- [ ] **Step 6: Add API route to generate and download the template**

Create `src/app/api/projects/[id]/templates/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { generateTemplatePdf } from '@/lib/pdf/generateTemplate';
import { createTemplateVersion } from '@/lib/db/templateVersions';

const DEFAULT_GRID = { columns: 5, rows: 6, cellSizePt: 90, markerSizePt: 12 };

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const projectId = Number(params.id);
  const entries = listGlyphSetEntries(projectId);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'glyph set is empty' }, { status: 400 });
  }
  createTemplateVersion(projectId, DEFAULT_GRID);
  const bytes = await generateTemplatePdf(entries, DEFAULT_GRID);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="template.pdf"',
    },
  });
}
```

- [ ] **Step 7: Add `TemplateGenerator` component**

Create `src/components/TemplateGenerator.tsx`:

```tsx
'use client';

export function TemplateGenerator({ projectId }: { projectId: number }): React.JSX.Element {
  async function handleGenerate(): Promise<void> {
    const response = await fetch(`/api/projects/${projectId}/templates`, { method: 'POST' });
    if (!response.ok) {
      const error = (await response.json()) as { error: string };
      window.alert(error.error);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template.pdf';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={handleGenerate} className="rounded bg-green-600 px-4 py-2 text-white">
      Generate PDF template
    </button>
  );
}
```

- [ ] **Step 8: Wire into project page**

Modify `src/app/projects/[id]/page.tsx`, add import and render:

```tsx
import { TemplateGenerator } from '@/components/TemplateGenerator';
// ... inside the returned JSX, after <GlyphSetEditor .../>:
<TemplateGenerator projectId={project.id} />
```

- [ ] **Step 9: Manual verification**

Run `pnpm dev`, add a few characters, click "Generate PDF template", confirm a valid PDF downloads with grid cells, faint labels, and 4 corner markers.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add PDF template generation with registration markers"
```

---

### Task 5: Scan upload + alignment (Python `align_scan.py`)

**Files:**
- Create: `python/font_creator_tools/align_scan.py`
- Create: `python/tests/test_align_scan.py`
- Create: `python/tests/fixtures/` (test fixture image generation helper)
- Create: `src/lib/db/scans.ts`
- Create: `src/lib/python/runPython.ts`
- Create: `src/app/api/projects/[id]/scans/route.ts`
- Create: `src/components/ScanUploader.tsx`

**Interfaces:**
- Consumes: `getLatestTemplateVersion(projectId)` from Task 4 (for grid config, marker size).
- Produces:
  - Python CLI: `uv run python -m font_creator_tools.align_scan --input <path> --marker-size-pt <n> --output <path>` → prints JSON `{"ok": true, "output_path": "..."}` or `{"ok": false, "error": "markers_not_found"}` to stdout.
  - `runPythonTool(module: string, args: string[]): Promise<{ ok: boolean; [key: string]: unknown }>` from `src/lib/python/runPython.ts`.
  - `createScan(projectId: number, templateVersionId: number, filePath: string): Scan`, `updateScanAlignment(scanId: number, status: 'aligned' | 'failed'): void` from `src/lib/db/scans.ts`.

- [ ] **Step 1: Write failing pytest for marker detection**

Create `python/tests/fixtures/__init__.py` (empty) and `python/tests/test_align_scan.py`:

```python
import numpy as np
import cv2
from font_creator_tools.align_scan import find_registration_markers


def make_test_image_with_markers() -> np.ndarray:
    image = np.full((600, 400, 3), 255, dtype=np.uint8)
    marker_size = 20
    corners = [(10, 10), (370, 10), (10, 570), (370, 570)]
    for x, y in corners:
        cv2.rectangle(image, (x, y), (x + marker_size, y + marker_size), (0, 0, 0), -1)
    return image


def test_find_registration_markers_detects_four_corners():
    image = make_test_image_with_markers()
    markers = find_registration_markers(image)
    assert len(markers) == 4
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd python && uv run pytest tests/test_align_scan.py -v`
Expected: FAIL (`ModuleNotFoundError` or `ImportError: find_registration_markers`).

- [ ] **Step 3: Implement marker detection and perspective correction**

Create `python/font_creator_tools/align_scan.py`:

```python
import argparse
import json
import sys
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Marker:
    center_x: float
    center_y: float
    area: float


def find_registration_markers(image: np.ndarray) -> list[Marker]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: list[Marker] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 50:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h else 0
        if 0.7 <= aspect_ratio <= 1.3:
            candidates.append(Marker(center_x=x + w / 2, center_y=y + h / 2, area=area))

    candidates.sort(key=lambda marker: marker.area, reverse=True)
    return candidates[:4]


def order_markers_clockwise(markers: list[Marker]) -> list[Marker]:
    center_x = sum(marker.center_x for marker in markers) / len(markers)
    center_y = sum(marker.center_y for marker in markers) / len(markers)

    def quadrant_key(marker: Marker) -> tuple[int, float]:
        is_top = marker.center_y < center_y
        is_left = marker.center_x < center_x
        if is_top and is_left:
            return (0, 0)
        if is_top and not is_left:
            return (1, 0)
        if not is_top and not is_left:
            return (2, 0)
        return (3, 0)

    return sorted(markers, key=quadrant_key)


def align_scan(input_path: str, output_path: str) -> dict[str, object]:
    image = cv2.imread(input_path)
    if image is None:
        return {"ok": False, "error": "cannot_read_image"}

    markers = find_registration_markers(image)
    if len(markers) != 4:
        return {"ok": False, "error": "markers_not_found", "found": len(markers)}

    ordered = order_markers_clockwise(markers)
    src_points = np.array(
        [[marker.center_x, marker.center_y] for marker in ordered], dtype=np.float32
    )
    height, width = image.shape[:2]
    dst_points = np.array(
        [[0, 0], [width, 0], [0, height], [width, height]], dtype=np.float32
    )
    matrix = cv2.getPerspectiveTransform(src_points, dst_points)
    aligned = cv2.warpPerspective(image, matrix, (width, height))
    cv2.imwrite(output_path, aligned)
    return {"ok": True, "output_path": output_path}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = align_scan(args.input, args.output)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd python && uv run pytest tests/test_align_scan.py -v`
Expected: 1 passed.

- [ ] **Step 5: Add end-to-end pytest for `align_scan` (full transform)**

Append to `python/tests/test_align_scan.py`:

```python
import tempfile
import os
from font_creator_tools.align_scan import align_scan


def test_align_scan_writes_output_file():
    image = make_test_image_with_markers()
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "input.png")
        output_path = os.path.join(tmp_dir, "output.png")
        cv2.imwrite(input_path, image)
        result = align_scan(input_path, output_path)
        assert result["ok"] is True
        assert os.path.exists(output_path)


def test_align_scan_reports_failure_without_markers():
    blank = np.full((600, 400, 3), 255, dtype=np.uint8)
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "input.png")
        output_path = os.path.join(tmp_dir, "output.png")
        cv2.imwrite(input_path, blank)
        result = align_scan(input_path, output_path)
        assert result["ok"] is False
        assert result["error"] == "markers_not_found"
```

Run: `cd python && uv run pytest tests/test_align_scan.py -v`
Expected: 3 passed.

- [ ] **Step 6: Node subprocess wrapper**

Create `src/lib/python/runPython.ts`:

```typescript
import { spawn } from 'node:child_process';
import path from 'node:path';

const PYTHON_DIR = path.join(process.cwd(), 'python');

export async function runPythonTool(
  module: string,
  args: string[],
): Promise<{ ok: boolean; [key: string]: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn('uv', ['run', 'python', '-m', module, ...args], { cwd: PYTHON_DIR });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout.trim().split('\n').pop() ?? '{}'));
      } catch {
        reject(new Error(`Failed to parse Python output: ${stdout} ${stderr}`));
      }
    });
  });
}
```

- [ ] **Step 7: `scans` DB module**

Create `src/lib/db/scans.ts`:

```typescript
import { getDb } from '../db';

export type Scan = {
  id: number;
  projectId: number;
  templateVersionId: number;
  filePath: string;
  uploadedAt: string;
  alignmentStatus: 'pending' | 'aligned' | 'failed';
};

type ScanRow = {
  id: number;
  project_id: number;
  template_version_id: number;
  file_path: string;
  uploaded_at: string;
  alignment_status: 'pending' | 'aligned' | 'failed';
};

function toScan(row: ScanRow): Scan {
  return {
    id: row.id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
    filePath: row.file_path,
    uploadedAt: row.uploaded_at,
    alignmentStatus: row.alignment_status,
  };
}

export function createScan(projectId: number, templateVersionId: number, filePath: string): Scan {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO scans (project_id, template_version_id, file_path) VALUES (?, ?, ?)')
    .run(projectId, templateVersionId, filePath);
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(Number(result.lastInsertRowid)) as ScanRow;
  return toScan(row);
}

export function updateScanAlignment(scanId: number, status: 'aligned' | 'failed'): void {
  const db = getDb();
  db.prepare('UPDATE scans SET alignment_status = ? WHERE id = ?').run(status, scanId);
}
```

- [ ] **Step 8: Upload API route**

Create `src/app/api/projects/[id]/scans/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import { createScan, updateScanAlignment } from '@/lib/db/scans';
import { runPythonTool } from '@/lib/python/runPython';

const DATA_DIR = process.env.DATA_DIR ?? './data';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const projectId = Number(params.id);
  const templateVersion = getLatestTemplateVersion(projectId);
  if (!templateVersion) {
    return NextResponse.json({ error: 'no template generated yet' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const projectDir = path.join(DATA_DIR, 'projects', String(projectId), 'scans');
  await fs.mkdir(projectDir, { recursive: true });
  const rawPath = path.join(projectDir, `raw-${Date.now()}.png`);
  const alignedPath = path.join(projectDir, `aligned-${Date.now()}.png`);
  await fs.writeFile(rawPath, Buffer.from(await file.arrayBuffer()));

  const scan = createScan(projectId, templateVersion.id, alignedPath);
  const result = await runPythonTool('font_creator_tools.align_scan', [
    '--input',
    rawPath,
    '--output',
    alignedPath,
  ]);
  updateScanAlignment(scan.id, result.ok ? 'aligned' : 'failed');

  return NextResponse.json({ ...scan, alignmentStatus: result.ok ? 'aligned' : 'failed' });
}
```

- [ ] **Step 9: `ScanUploader` component**

Create `src/components/ScanUploader.tsx`:

```tsx
'use client';

import { useState } from 'react';

export function ScanUploader({ projectId }: { projectId: number }): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setStatus('Uploading and aligning...');
    const response = await fetch(`/api/projects/${projectId}/scans`, {
      method: 'POST',
      body: formData,
    });
    const result = (await response.json()) as { alignmentStatus: string };
    setStatus(
      result.alignmentStatus === 'aligned'
        ? 'Scan aligned successfully.'
        : 'Alignment failed - registration markers not detected. Rescan and try again.',
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Upload scan</h2>
      <input type="file" accept="image/*" onChange={handleFileChange} aria-label="Upload scan" />
      {status && <p className="mt-2 text-sm">{status}</p>}
    </section>
  );
}
```

- [ ] **Step 10: Manual verification**

Run `pnpm dev`, generate a template, print/scan (or use a photo of a printed page with visible corner markers), upload it, confirm alignment succeeds and `aligned-*.png` is written to `data/projects/<id>/scans/`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add scan upload with registration-marker alignment"
```

---

### Task 6: Glyph extraction (Python `extract_glyphs.py`)

**Files:**
- Create: `python/font_creator_tools/extract_glyphs.py`
- Create: `python/tests/test_extract_glyphs.py`
- Create: `src/lib/db/glyphs.ts`
- Modify: `src/app/api/projects/[id]/scans/route.ts` (trigger extraction after alignment)
- Create: `src/app/api/projects/[id]/glyphs/route.ts`

**Interfaces:**
- Consumes: aligned scan path from Task 5, `GridConfig` from Task 4, `listGlyphSetEntries` from Task 3.
- Produces:
  - Python CLI: `uv run python -m font_creator_tools.extract_glyphs --input <aligned.png> --columns <n> --rows <n> --cell-size-px <n> --output-dir <dir>` → JSON `{"ok": true, "cells": [{"index": 0, "svg_path": "...", "bbox": [x, y, w, h]}, ...]}`.
  - `createGlyph(glyphSetId: number, scanId: number, svgPath: string, bboxRaw: [number, number, number, number]): Glyph` from `src/lib/db/glyphs.ts`.
  - `type Glyph = { id: number; glyphSetId: number; scanId: number; svgPath: string | null; bboxRaw: [number, number, number, number] | null; advanceWidthOverride: number | null; leftBearingOverride: number | null; status: 'pending' | 'reviewed' | 'approved' | 'failed' }`

- [ ] **Step 1: Write failing pytest for cell cropping and bbox detection**

Create `python/tests/test_extract_glyphs.py`:

```python
import numpy as np
import cv2
import tempfile
import os
from font_creator_tools.extract_glyphs import extract_glyphs


def make_grid_image(columns: int, rows: int, cell_size: int) -> np.ndarray:
    width = columns * cell_size
    height = rows * cell_size
    image = np.full((height, width, 3), 255, dtype=np.uint8)
    # Draw a black square inside cell (0, 0) to simulate a handwritten stroke
    cv2.rectangle(image, (20, 20), (40, 40), (0, 0, 0), -1)
    return image


def test_extract_glyphs_produces_one_svg_per_cell_with_content():
    image = make_grid_image(columns=2, rows=2, cell_size=100)
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "aligned.png")
        cv2.imwrite(input_path, image)
        output_dir = os.path.join(tmp_dir, "glyphs")
        result = extract_glyphs(input_path, columns=2, rows=2, cell_size_px=100, output_dir=output_dir)
        assert result["ok"] is True
        # Only cell (0,0) has ink; empty cells should be skipped
        assert len(result["cells"]) == 1
        assert result["cells"][0]["index"] == 0
        assert os.path.exists(result["cells"][0]["svg_path"])
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd python && uv run pytest tests/test_extract_glyphs.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `extract_glyphs.py`**

```python
import argparse
import json
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

INK_THRESHOLD = 200
MIN_INK_PIXELS = 20


def cell_has_ink(cell: np.ndarray) -> bool:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    ink_pixels = int(np.sum(gray < INK_THRESHOLD))
    return ink_pixels >= MIN_INK_PIXELS


def bbox_of_ink(cell: np.ndarray) -> tuple[int, int, int, int]:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    mask = gray < INK_THRESHOLD
    ys, xs = np.where(mask)
    x, y = int(xs.min()), int(ys.min())
    w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return x, y, w, h


def trace_to_svg(cell: np.ndarray, svg_path: str) -> None:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, INK_THRESHOLD, 255, cv2.THRESH_BINARY_INV)
    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as tmp_pbm:
        cv2.imwrite(tmp_pbm.name, binary)
        subprocess.run(
            ["potrace", tmp_pbm.name, "--svg", "-o", svg_path],
            check=True,
        )
    os.unlink(tmp_pbm.name)


def extract_glyphs(
    input_path: str,
    columns: int,
    rows: int,
    cell_size_px: int,
    output_dir: str,
) -> dict[str, object]:
    image = cv2.imread(input_path)
    if image is None:
        return {"ok": False, "error": "cannot_read_image"}

    os.makedirs(output_dir, exist_ok=True)
    cells: list[dict[str, object]] = []

    for row in range(rows):
        for col in range(columns):
            index = row * columns + col
            x, y = col * cell_size_px, row * cell_size_px
            cell = image[y : y + cell_size_px, x : x + cell_size_px]
            if not cell_has_ink(cell):
                continue
            bbox = bbox_of_ink(cell)
            svg_path = os.path.join(output_dir, f"glyph-{index}.svg")
            trace_to_svg(cell, svg_path)
            cells.append({"index": index, "svg_path": svg_path, "bbox": list(bbox)})

    return {"ok": True, "cells": cells}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--cell-size-px", type=int, required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    result = extract_glyphs(args.input, args.columns, args.rows, args.cell_size_px, args.output_dir)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd python && uv run pytest tests/test_extract_glyphs.py -v`
Expected: 1 passed. (Requires system `potrace` installed.)

- [ ] **Step 5: `glyphs` DB module**

Create `src/lib/db/glyphs.ts`:

```typescript
import { getDb } from '../db';

export type Glyph = {
  id: number;
  glyphSetId: number;
  scanId: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  leftBearingOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

type GlyphRow = {
  id: number;
  glyph_set_id: number;
  scan_id: number;
  svg_path: string | null;
  bbox_raw: string | null;
  advance_width_override: number | null;
  left_bearing_override: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

function toGlyph(row: GlyphRow): Glyph {
  return {
    id: row.id,
    glyphSetId: row.glyph_set_id,
    scanId: row.scan_id,
    svgPath: row.svg_path,
    bboxRaw: row.bbox_raw ? (JSON.parse(row.bbox_raw) as [number, number, number, number]) : null,
    advanceWidthOverride: row.advance_width_override,
    leftBearingOverride: row.left_bearing_override,
    status: row.status,
  };
}

export function createGlyph(
  glyphSetId: number,
  scanId: number,
  svgPath: string,
  bboxRaw: [number, number, number, number],
): Glyph {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO glyphs (glyph_set_id, scan_id, svg_path, bbox_raw) VALUES (?, ?, ?, ?)')
    .run(glyphSetId, scanId, svgPath, JSON.stringify(bboxRaw));
  const row = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(Number(result.lastInsertRowid)) as GlyphRow;
  return toGlyph(row);
}

export function listGlyphsByScan(scanId: number): Glyph[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM glyphs WHERE scan_id = ?').all(scanId) as GlyphRow[];
  return rows.map(toGlyph);
}

export function updateGlyphOverrides(
  glyphId: number,
  overrides: { advanceWidthOverride?: number; leftBearingOverride?: number; status?: Glyph['status'] },
): void {
  const db = getDb();
  const current = db.prepare('SELECT * FROM glyphs WHERE id = ?').get(glyphId) as GlyphRow;
  db.prepare(
    'UPDATE glyphs SET advance_width_override = ?, left_bearing_override = ?, status = ? WHERE id = ?',
  ).run(
    overrides.advanceWidthOverride ?? current.advance_width_override,
    overrides.leftBearingOverride ?? current.left_bearing_override,
    overrides.status ?? current.status,
    glyphId,
  );
}
```

- [ ] **Step 6: Trigger extraction after alignment in scans route**

Modify `src/app/api/projects/[id]/scans/route.ts`: after `updateScanAlignment`, if aligned, call extraction and map cells to glyph-set entries by index (assumes entries were laid out in the same order used to generate the template — order by `sortOrder`):

```typescript
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { createGlyph } from '@/lib/db/glyphs';

// ... inside POST, after updateScanAlignment:
if (result.ok) {
  const glyphOutputDir = path.join(projectDir, `glyphs-${scan.id}`);
  const grid = templateVersion.gridConfig;
  const extraction = await runPythonTool('font_creator_tools.extract_glyphs', [
    '--input',
    alignedPath,
    '--columns',
    String(grid.columns),
    '--rows',
    String(grid.rows),
    '--cell-size-px',
    String(grid.cellSizePt),
    '--output-dir',
    glyphOutputDir,
  ]);
  if (extraction.ok) {
    const entries = listGlyphSetEntries(projectId);
    const cells = extraction.cells as { index: number; svg_path: string; bbox: [number, number, number, number] }[];
    for (const cell of cells) {
      const entry = entries[cell.index];
      if (entry) {
        createGlyph(entry.id, scan.id, cell.svg_path, cell.bbox);
      }
    }
  }
}
```

- [ ] **Step 7: Glyphs listing API route**

Create `src/app/api/projects/[id]/glyphs/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listGlyphsByScan } from '@/lib/db/glyphs';

export function GET(
  request: Request,
  { params }: { params: { id: string } },
): NextResponse {
  const url = new URL(request.url);
  const scanId = url.searchParams.get('scanId');
  if (!scanId) {
    return NextResponse.json({ error: 'scanId query param is required' }, { status: 400 });
  }
  void params;
  void getDb; // db accessed indirectly via listGlyphsByScan
  return NextResponse.json(listGlyphsByScan(Number(scanId)));
}
```

- [ ] **Step 8: Manual verification**

Upload a real scan, confirm `glyphs` table populates with one row per non-empty cell, each with a valid `svg_path` and `bbox_raw`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: extract glyphs from aligned scans via potrace"
```

---

### Task 7: Glyph review UI with advance-width editor

**Files:**
- Create: `src/app/api/glyphs/[glyphId]/route.ts`
- Create: `src/components/GlyphReviewGrid.tsx`
- Create: `src/components/GlyphWidthEditor.tsx`
- Create: `src/app/projects/[id]/review/page.tsx`

**Interfaces:**
- Consumes: `listGlyphsByScan`, `updateGlyphOverrides` from Task 6.
- Produces: `PATCH /api/glyphs/[glyphId]` accepting `{ advanceWidthOverride?: number; leftBearingOverride?: number; status?: string }`.

- [ ] **Step 1: PATCH API route**

Create `src/app/api/glyphs/[glyphId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateGlyphOverrides } from '@/lib/db/glyphs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { glyphId: string } },
): Promise<NextResponse> {
  const body = (await request.json()) as {
    advanceWidthOverride?: number;
    leftBearingOverride?: number;
    status?: 'pending' | 'reviewed' | 'approved' | 'failed';
  };
  updateGlyphOverrides(Number(params.glyphId), body);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `GlyphWidthEditor` component (live spacing preview)**

Create `src/components/GlyphWidthEditor.tsx`:

```tsx
'use client';

import { useState } from 'react';

type Glyph = {
  id: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
};

export function GlyphWidthEditor({ glyph, charLabel }: { glyph: Glyph; charLabel: string }): React.JSX.Element {
  const detectedWidth = glyph.bboxRaw ? glyph.bboxRaw[2] : 0;
  const [width, setWidth] = useState(glyph.advanceWidthOverride ?? detectedWidth);

  async function persist(nextWidth: number): Promise<void> {
    setWidth(nextWidth);
    await fetch(`/api/glyphs/${glyph.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceWidthOverride: nextWidth }),
    });
  }

  async function approve(): Promise<void> {
    await fetch(`/api/glyphs/${glyph.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
  }

  return (
    <div className="rounded border p-3">
      <p className="font-mono text-lg">{charLabel}</p>
      <div className="my-2 flex items-end bg-gray-50 p-2" style={{ width: `${width + 60}px` }}>
        <span style={{ width: `${width}px` }} className="inline-block border-r border-dashed border-red-400">
          {charLabel}
        </span>
        <span>n</span>
      </div>
      <label htmlFor={`width-${glyph.id}`} className="block text-sm">
        Advance width: {width}px (detected: {detectedWidth}px)
      </label>
      <input
        id={`width-${glyph.id}`}
        type="range"
        min={Math.max(0, detectedWidth - 40)}
        max={detectedWidth + 40}
        value={width}
        onChange={(event) => persist(Number(event.target.value))}
        className="w-full"
      />
      <button type="button" onClick={approve} className="mt-2 rounded bg-green-600 px-3 py-1 text-white">
        Approve
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `GlyphReviewGrid` component**

Create `src/components/GlyphReviewGrid.tsx`:

```tsx
import { GlyphWidthEditor } from './GlyphWidthEditor';

type GlyphWithChar = {
  id: number;
  svgPath: string | null;
  bboxRaw: [number, number, number, number] | null;
  advanceWidthOverride: number | null;
  status: 'pending' | 'reviewed' | 'approved' | 'failed';
  charLabel: string;
};

export function GlyphReviewGrid({ glyphs }: { glyphs: GlyphWithChar[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-4">
      {glyphs.map((glyph) => (
        <GlyphWidthEditor key={glyph.id} glyph={glyph} charLabel={glyph.charLabel} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Review page**

Create `src/app/projects/[id]/review/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/db/projects';
import { listGlyphSetEntries } from '@/lib/db/glyphSets';
import { getDb } from '@/lib/db';
import { GlyphReviewGrid } from '@/components/GlyphReviewGrid';

export default function ReviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { scanId?: string };
}): React.JSX.Element {
  const project = getProject(Number(params.id));
  if (!project || !searchParams.scanId) notFound();

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT glyphs.*, glyph_set.char_value AS char_label
       FROM glyphs
       JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id
       WHERE glyphs.scan_id = ?`,
    )
    .all(Number(searchParams.scanId)) as {
    id: number;
    svg_path: string | null;
    bbox_raw: string | null;
    advance_width_override: number | null;
    status: 'pending' | 'reviewed' | 'approved' | 'failed';
    char_label: string;
  }[];

  const glyphs = rows.map((row) => ({
    id: row.id,
    svgPath: row.svg_path,
    bboxRaw: row.bbox_raw ? (JSON.parse(row.bbox_raw) as [number, number, number, number]) : null,
    advanceWidthOverride: row.advance_width_override,
    status: row.status,
    charLabel: row.char_label,
  }));

  void listGlyphSetEntries; // reserved for future ordering use

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Review glyphs — {project.name}</h1>
      <GlyphReviewGrid glyphs={glyphs} />
    </main>
  );
}
```

- [ ] **Step 5: Manual verification**

After uploading and extracting a scan, navigate to `/projects/[id]/review?scanId=<scanId>`, adjust an advance width slider, confirm the value persists (reload page, confirm override is reflected) and "Approve" sets status.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add glyph review UI with per-glyph advance width editing"
```

---

### Task 8: Font building (Python `build_font.py`)

**Files:**
- Create: `python/font_creator_tools/build_font.py`
- Create: `python/tests/test_build_font.py`
- Create: `src/lib/db/builds.ts`
- Create: `src/app/api/projects/[id]/builds/route.ts`

**Interfaces:**
- Consumes: approved `Glyph` rows (svgPath, advanceWidthOverride, bboxRaw), `GlyphSetEntry` (charValue, type, componentChars) for the project.
- Produces:
  - Python CLI: `uv run python -m font_creator_tools.build_font --spec <spec.json> --output-otf <path> --output-ttf <path> --family-name <name>` where `spec.json` is `{"glyphs": [{"char": "a", "svg_path": "...", "advance_width": 600}], "ligatures": [{"chars": "ti", "component_chars": "ti", "svg_path": "...", "advance_width": 900}]}` → JSON `{"ok": true, "otf_path": "...", "ttf_path": "..."}`.
  - `createBuild(projectId: number, otfPath: string, ttfPath: string, fontMetrics: object): Build` from `src/lib/db/builds.ts`.

- [ ] **Step 1: Write failing pytest for building a minimal font**

Create `python/tests/test_build_font.py`:

```python
import json
import os
import tempfile

from fontTools.ttLib import TTFont
from font_creator_tools.build_font import build_font

SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 0 L100 100 L0 100 Z"/></svg>'


def test_build_font_creates_valid_otf_with_expected_glyphs():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "a.svg")
        with open(svg_path, "w") as handle:
            handle.write(SIMPLE_SVG)

        spec = {
            "glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 600}],
            "ligatures": [],
        }
        otf_path = os.path.join(tmp_dir, "out.otf")
        ttf_path = os.path.join(tmp_dir, "out.ttf")

        result = build_font(spec, otf_path, ttf_path, family_name="Test Hand")

        assert result["ok"] is True
        assert os.path.exists(otf_path)
        assert os.path.exists(ttf_path)

        font = TTFont(otf_path)
        assert "a" in font.getGlyphOrder() or "uni0061" in font.getGlyphOrder()
        hmtx = font["hmtx"]
        glyph_name = font.getBestCmap()[ord("a")]
        advance_width, _ = hmtx[glyph_name]
        assert advance_width == 600
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd python && uv run pytest tests/test_build_font.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `build_font.py`**

```python
import argparse
import json
import sys
from typing import Any

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.svgLib.path import SVGPath
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
ASCENDER = 800
DESCENDER = -200


def glyph_name_for_char(char: str) -> str:
    if len(char) == 1 and char.isalnum():
        return char
    return f"uni{ord(char[0]):04X}" if len(char) == 1 else f"liga.{'_'.join(str(ord(c)) for c in char)}"


def build_charstrings(glyph_specs: list[dict[str, Any]]) -> dict[str, Any]:
    charstrings: dict[str, Any] = {}
    for spec in glyph_specs:
        svg_path = SVGPath(spec["svg_path"])
        pen = T2CharStringPen(spec["advance_width"], glyphSet=None)
        svg_path.draw(pen)
        charstrings[spec["glyph_name"]] = pen.getCharString()
    return charstrings


def build_font(
    spec: dict[str, Any],
    otf_path: str,
    ttf_path: str,
    family_name: str,
) -> dict[str, object]:
    all_glyphs = [
        {**g, "glyph_name": glyph_name_for_char(g["char"])} for g in spec["glyphs"]
    ] + [
        {**l, "glyph_name": glyph_name_for_char(l["chars"])} for l in spec.get("ligatures", [])
    ]

    glyph_order = [".notdef"] + [g["glyph_name"] for g in all_glyphs]
    advance_widths = {".notdef": UNITS_PER_EM // 2, **{g["glyph_name"]: g["advance_width"] for g in all_glyphs}}
    cmap = {ord(g["char"]): g["glyph_name"] for g in spec["glyphs"]}

    fb = FontBuilder(UNITS_PER_EM, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)

    charstrings = {".notdef": T2CharStringPen(UNITS_PER_EM // 2, glyphSet=None).getCharString()}
    charstrings.update(build_charstrings(all_glyphs))
    fb.setupCFF(family_name, {"FullName": family_name}, charstrings, {})

    fb.setupHorizontalMetrics(
        {name: (advance_widths[name], 0) for name in glyph_order}
    )
    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupNameTable({"familyName": family_name, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ASCENDER, sTypoDescender=DESCENDER, usWinAscent=ASCENDER, usWinDescent=-DESCENDER)
    fb.setupPost()

    ligature_specs = spec.get("ligatures", [])
    if ligature_specs:
        setup_ligature_substitution(fb, ligature_specs)

    fb.font.save(otf_path)

    ttf_builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    ttf_builder.setupGlyphOrder(glyph_order)
    ttf_builder.setupCharacterMap(cmap)
    glyf_glyphs = {".notdef": TTGlyphPen(None).glyph()}
    for g in all_glyphs:
        pen = TTGlyphPen(None)
        SVGPath(g["svg_path"]).draw(pen)
        glyf_glyphs[g["glyph_name"]] = pen.glyph()
    ttf_builder.setupGlyf(glyf_glyphs)
    ttf_builder.setupHorizontalMetrics({name: (advance_widths[name], 0) for name in glyph_order})
    ttf_builder.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    ttf_builder.setupNameTable({"familyName": family_name, "styleName": "Regular"})
    ttf_builder.setupOS2(sTypoAscender=ASCENDER, sTypoDescender=DESCENDER, usWinAscent=ASCENDER, usWinDescent=-DESCENDER)
    ttf_builder.setupPost()
    ttf_builder.font.save(ttf_path)

    return {"ok": True, "otf_path": otf_path, "ttf_path": ttf_path}


def setup_ligature_substitution(fb: FontBuilder, ligature_specs: list[dict[str, Any]]) -> None:
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

    rules = []
    for ligature in ligature_specs:
        components = " ".join(ligature["component_chars"])
        target = glyph_name_for_char(ligature["chars"])
        rules.append(f"sub {components} by {target};")
    feature_code = "feature liga {\n" + "\n".join(rules) + "\n} liga;\n"
    addOpenTypeFeaturesFromString(fb.font, feature_code)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--output-otf", required=True)
    parser.add_argument("--output-ttf", required=True)
    parser.add_argument("--family-name", required=True)
    args = parser.parse_args()

    with open(args.spec) as handle:
        spec = json.load(handle)

    result = build_font(spec, args.output_otf, args.output_ttf, args.family_name)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd python && uv run pytest tests/test_build_font.py -v`
Expected: 1 passed. Debug CFF/glyf pen usage against installed `fontTools` version docs if API signatures differ — check `fontTools` changelog for `T2CharStringPen`/`TTGlyphPen` constructor signatures before assuming the above is exact; adjust to match the installed version's actual API (fetch current fontTools docs, do not guess further).

- [ ] **Step 5: `builds` DB module**

Create `src/lib/db/builds.ts`:

```typescript
import { getDb } from '../db';

export type Build = {
  id: number;
  projectId: number;
  createdAt: string;
  otfPath: string | null;
  ttfPath: string | null;
  fontMetrics: Record<string, unknown> | null;
};

type BuildRow = {
  id: number;
  project_id: number;
  created_at: string;
  otf_path: string | null;
  ttf_path: string | null;
  font_metrics: string | null;
};

function toBuild(row: BuildRow): Build {
  return {
    id: row.id,
    projectId: row.project_id,
    createdAt: row.created_at,
    otfPath: row.otf_path,
    ttfPath: row.ttf_path,
    fontMetrics: row.font_metrics ? (JSON.parse(row.font_metrics) as Record<string, unknown>) : null,
  };
}

export function createBuild(
  projectId: number,
  otfPath: string,
  ttfPath: string,
  fontMetrics: Record<string, unknown>,
): Build {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO builds (project_id, otf_path, ttf_path, font_metrics) VALUES (?, ?, ?, ?)')
    .run(projectId, otfPath, ttfPath, JSON.stringify(fontMetrics));
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(Number(result.lastInsertRowid)) as BuildRow;
  return toBuild(row);
}

export function listBuilds(projectId: number): Build[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM builds WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as BuildRow[];
  return rows.map(toBuild);
}
```

- [ ] **Step 6: Build-trigger API route**

Create `src/app/api/projects/[id]/builds/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/db/projects';
import { getDb } from '@/lib/db';
import { createBuild, listBuilds } from '@/lib/db/builds';
import { runPythonTool } from '@/lib/python/runPython';

const DATA_DIR = process.env.DATA_DIR ?? './data';

type ApprovedGlyphRow = {
  char_value: string;
  type: 'single' | 'ligature';
  component_chars: string | null;
  svg_path: string;
  bbox_raw: string;
  advance_width_override: number | null;
};

export function GET(
  _request: Request,
  { params }: { params: { id: string } },
): NextResponse {
  return NextResponse.json(listBuilds(Number(params.id)));
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const projectId = Number(params.id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT glyph_set.char_value, glyph_set.type, glyph_set.component_chars,
              glyphs.svg_path, glyphs.bbox_raw, glyphs.advance_width_override
       FROM glyphs
       JOIN glyph_set ON glyph_set.id = glyphs.glyph_set_id
       WHERE glyphs.status = 'approved' AND glyph_set.project_id = ?`,
    )
    .all(projectId) as ApprovedGlyphRow[];

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no approved glyphs' }, { status: 400 });
  }

  const glyphs = rows
    .filter((row) => row.type === 'single')
    .map((row) => ({
      char: row.char_value,
      svg_path: row.svg_path,
      advance_width: row.advance_width_override ?? JSON.parse(row.bbox_raw)[2],
    }));
  const ligatures = rows
    .filter((row) => row.type === 'ligature')
    .map((row) => ({
      chars: row.char_value,
      component_chars: row.component_chars,
      svg_path: row.svg_path,
      advance_width: row.advance_width_override ?? JSON.parse(row.bbox_raw)[2],
    }));

  const buildDir = path.join(DATA_DIR, 'projects', String(projectId), 'builds');
  await fs.mkdir(buildDir, { recursive: true });
  const specPath = path.join(buildDir, `spec-${Date.now()}.json`);
  const otfPath = path.join(buildDir, `${project.name}.otf`);
  const ttfPath = path.join(buildDir, `${project.name}.ttf`);
  await fs.writeFile(specPath, JSON.stringify({ glyphs, ligatures }));

  const result = await runPythonTool('font_creator_tools.build_font', [
    '--spec',
    specPath,
    '--output-otf',
    otfPath,
    '--output-ttf',
    ttfPath,
    '--family-name',
    project.name,
  ]);

  if (!result.ok) {
    return NextResponse.json({ error: 'font build failed', details: result }, { status: 500 });
  }

  const build = createBuild(projectId, otfPath, ttfPath, { unitsPerEm: 1000, ascender: 800, descender: -200 });
  return NextResponse.json(build, { status: 201 });
}
```

- [ ] **Step 7: Manual verification**

Approve several glyphs including one ligature in the review UI, `POST /api/projects/[id]/builds`, confirm `.otf` and `.ttf` files are created and open successfully in macOS Font Book (`open <path>.otf`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: build installable OTF/TTF fonts with ligature substitution"
```

---

### Task 9: Font build UI panel and macOS install shortcut

**Files:**
- Create: `src/components/FontBuildPanel.tsx`
- Modify: `src/app/projects/[id]/page.tsx` (render `FontBuildPanel`)
- Create: `src/app/api/builds/[buildId]/download/route.ts`

**Interfaces:**
- Consumes: `listBuilds(projectId)` from Task 8, `POST /api/projects/[id]/builds`.

- [ ] **Step 1: Download route**

Create `src/app/api/builds/[buildId]/download/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { buildId: string } },
): Promise<NextResponse> {
  const db = getDb();
  const format = new URL(request.url).searchParams.get('format') ?? 'otf';
  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(Number(params.buildId)) as
    | { otf_path: string; ttf_path: string }
    | undefined;
  if (!build) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const filePath = format === 'ttf' ? build.ttf_path : build.otf_path;
  const bytes = await fs.readFile(filePath);
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'font/otf',
      'Content-Disposition': `attachment; filename="${filePath.split('/').pop()}"`,
    },
  });
}
```

- [ ] **Step 2: `FontBuildPanel` component**

Create `src/components/FontBuildPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';

type Build = { id: number; createdAt: string; otfPath: string | null; ttfPath: string | null };

export function FontBuildPanel({
  projectId,
  initialBuilds,
}: {
  projectId: number;
  initialBuilds: Build[];
}): React.JSX.Element {
  const [builds, setBuilds] = useState(initialBuilds);
  const [error, setError] = useState<string | null>(null);

  async function handleBuild(): Promise<void> {
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/builds`, { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json()) as { error: string };
      setError(body.error);
      return;
    }
    const build = (await response.json()) as Build;
    setBuilds([build, ...builds]);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Build font</h2>
      <button type="button" onClick={handleBuild} className="rounded bg-purple-600 px-4 py-2 text-white">
        Build font from approved glyphs
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-4 space-y-1">
        {builds.map((build) => (
          <li key={build.id}>
            {build.createdAt} —{' '}
            <a href={`/api/builds/${build.id}/download?format=otf`} className="text-blue-600 underline">
              Download .otf
            </a>{' '}
            <a href={`/api/builds/${build.id}/download?format=ttf`} className="text-blue-600 underline">
              Download .ttf
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Wire into project page**

Modify `src/app/projects/[id]/page.tsx`: import `listBuilds` and `FontBuildPanel`, render `<FontBuildPanel projectId={project.id} initialBuilds={listBuilds(project.id)} />`.

- [ ] **Step 4: Manual verification**

Click "Build font from approved glyphs", download the `.otf`, double-click it on macOS, confirm Font Book opens and offers install; install and check the font appears in a text editor's font picker.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add font build panel with macOS-installable downloads"
```

---

### Task 10: End-to-end smoke test and README

**Files:**
- Create: `README.md`
- Create: `e2e/full-flow.test.ts` (Vitest-based integration test hitting API routes in-process, not a browser e2e — full print/scan loop stays manual per the design doc)

**Interfaces:**
- Consumes: all API routes from Tasks 2-9.

- [ ] **Step 1: Write integration test covering the API flow without a real scan**

Create `e2e/full-flow.test.ts`. This test exercises project creation, glyph-set editing, and template generation end-to-end (the scan/extraction/build steps require real image fixtures already covered by Python pytest suites in Tasks 5-8, so this test stays scoped to the Node-side flow):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('full flow (Node-side, pre-scan)', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-e2e';
  });

  afterEach(() => {
    fs.rmSync('./data-test-e2e', { recursive: true, force: true });
  });

  it('creates a project, adds glyphs, and generates a template PDF', async () => {
    const { createProject } = await import('../src/lib/db/projects');
    const { addGlyphSetEntry, listGlyphSetEntries } = await import('../src/lib/db/glyphSets');
    const { generateTemplatePdf } = await import('../src/lib/pdf/generateTemplate');
    const { createTemplateVersion } = await import('../src/lib/db/templateVersions');

    const project = createProject('E2E Font');
    addGlyphSetEntry(project.id, 'a', 'single');
    addGlyphSetEntry(project.id, 'b', 'single');
    addGlyphSetEntry(project.id, 'ti', 'ligature', 'ti');

    const entries = listGlyphSetEntries(project.id);
    expect(entries).toHaveLength(3);

    const grid = { columns: 3, rows: 1, cellSizePt: 90, markerSizePt: 12 };
    createTemplateVersion(project.id, grid);
    const pdfBytes = await generateTemplatePdf(entries, grid);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add e2e test to Vitest config include path and run**

Ensure `vitest.config.ts` picks up `e2e/**/*.test.ts` (default Vitest glob already includes it if it matches `*.test.ts`).

Run: `pnpm test`
Expected: all tests pass, including the new e2e file.

- [ ] **Step 3: Write README**

Create `README.md`:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README and end-to-end integration test"
```

---

## Self-Review Notes

- Spec coverage: all sections of the design doc (architecture, data model, workflow, components, testing) map to Tasks 1-10.
- Placeholder scan: none found — the one caveat in Task 8 Step 4 flags a genuine external-API-verification need (fontTools pen constructor signatures), not a deferred implementation; it directs the implementer to check current docs rather than guess, per project convention.
- Type consistency: `Glyph`, `GlyphSetEntry`, `Project`, `Scan`, `Build`, `TemplateVersion`/`GridConfig` types are defined once (Tasks 2-8) and reused with identical shapes in later tasks' API routes and components.
