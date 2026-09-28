import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('glyph-set bulk route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyphset-bulk-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyphset-bulk-route', { recursive: true, force: true });
  });

  it('inserts only new characters and returns them', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { POST } = await import('./route');

    const project = createProject('Bulk Route Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    const params = Promise.resolve({ id: String(project.id) });
    const response = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: ['a', 'b', 'c'] }),
      }),
      { params },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.added.map((entry: { charValue: string }) => entry.charValue)).toEqual(['b', 'c']);
  });

  it('returns 404 for a missing project', async () => {
    const { POST } = await import('./route');
    const params = Promise.resolve({ id: '999999' });
    const response = await POST(
      new Request('http://localhost/api/projects/999999/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: ['a'] }),
      }),
      { params },
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when charValues is missing or empty', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { POST } = await import('./route');
    const project = createProject('Bad Body Test');
    const params = Promise.resolve({ id: String(project.id) });

    const missing = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params },
    );
    expect(missing.status).toBe(400);

    const empty = await POST(
      new Request('http://localhost/api/projects/1/glyph-set/bulk', {
        method: 'POST',
        body: JSON.stringify({ charValues: [] }),
      }),
      { params },
    );
    expect(empty.status).toBe(400);
  });
});
