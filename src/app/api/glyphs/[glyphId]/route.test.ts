import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { NextRequest } from 'next/server';

describe('glyph PATCH route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyph-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyph-route', { recursive: true, force: true });
  });

  async function setup() {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph } = await import('@/lib/db/glyphs');

    const project = createProject('Route test');
    const entry = addGlyphSetEntry(project.id, 'a', 'single');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    return createGlyph(entry.id, scan.id, '/path/to/glyph.svg', [0, 0, 10, 10]);
  }

  function patchRequest(body: unknown) {
    return new NextRequest('http://localhost/api/glyphs/1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('saves a valid vertical offset override', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ advanceWidthOverride: 500, verticalOffsetOverride: -60, status: 'approved' }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(200);
    const { getGlyph } = await import('@/lib/db/glyphs');
    expect(getGlyph(glyph.id)?.verticalOffsetOverride).toBe(-60);
  });

  it('rejects a vertical offset outside -150..150', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ verticalOffsetOverride: 151 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a non-integer vertical offset', async () => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ verticalOffsetOverride: 1.5 }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(400);
  });

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

  it.each([1, 10, 25, 49, 200])('saves scale %i%%, including small punctuation sizes', async (scaleOverride) => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ scaleOverride, status: 'approved' }), {
      params: Promise.resolve({ glyphId: String(glyph.id) }),
    });

    expect(response.status).toBe(200);
    const { getGlyph } = await import('@/lib/db/glyphs');
    expect(getGlyph(glyph.id)?.scaleOverride).toBe(scaleOverride);
  });

  it.each([0, -1, 201])('rejects scale %i outside 1..200', async (scaleOverride) => {
    const glyph = await setup();
    const { PATCH } = await import('./route');

    const response = await PATCH(patchRequest({ scaleOverride }), {
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
});
