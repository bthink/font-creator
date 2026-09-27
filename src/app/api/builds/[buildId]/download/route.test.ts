import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>';

describe('download route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-download-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-download-route', { recursive: true, force: true });
  });

  it('downloads otf file with correct content-type', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { POST } = await import('@/app/api/projects/[id]/builds/route');
    const { GET } = await import('./route');

    const project = createProject('Test Font');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-download-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPath = path.join(svgDir, 't.svg');
    fs.writeFileSync(svgPath, SVG);

    const entry = addGlyphSetEntry(project.id, 't', 'single');
    const glyph = createGlyph(entry.id, scan.id, svgPath, [0, 0, 100, 100]);
    updateGlyphOverrides(glyph.id, { status: 'approved', advanceWidthOverride: 600 });

    const params = Promise.resolve({ id: String(project.id) });
    const postResponse = await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }) as NextRequest, {
      params,
    });

    const build = await postResponse.json();
    expect(build.otfPath).toBeTruthy();

    const downloadParams = Promise.resolve({ buildId: String(build.id) });
    const getResponse = await GET(new Request('http://localhost/api/builds/1/download?format=otf') as NextRequest, {
      params: downloadParams,
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('Content-Type')).toBe('font/otf');
    expect(getResponse.headers.get('Content-Disposition')).toContain('attachment');
    const bytes = await getResponse.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('downloads ttf file with correct content-type', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { POST } = await import('@/app/api/projects/[id]/builds/route');
    const { GET } = await import('./route');

    const project = createProject('Test Font');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-download-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPath = path.join(svgDir, 't.svg');
    fs.writeFileSync(svgPath, SVG);

    const entry = addGlyphSetEntry(project.id, 't', 'single');
    const glyph = createGlyph(entry.id, scan.id, svgPath, [0, 0, 100, 100]);
    updateGlyphOverrides(glyph.id, { status: 'approved', advanceWidthOverride: 600 });

    const params = Promise.resolve({ id: String(project.id) });
    const postResponse = await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }) as NextRequest, {
      params,
    });

    const build = await postResponse.json();
    expect(build.ttfPath).toBeTruthy();

    const downloadParams = Promise.resolve({ buildId: String(build.id) });
    const getResponse = await GET(new Request('http://localhost/api/builds/1/download?format=ttf') as NextRequest, {
      params: downloadParams,
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('Content-Type')).toBe('font/ttf');
    const bytes = await getResponse.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('returns 404 for non-existent build', async () => {
    const { GET } = await import('./route');

    const downloadParams = Promise.resolve({ buildId: '9999' });
    const getResponse = await GET(new Request('http://localhost/api/builds/9999/download?format=otf') as NextRequest, {
      params: downloadParams,
    });

    expect(getResponse.status).toBe(404);
  });

  it('returns 400 when build exists but file path is null', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { createBuild } = await import('@/lib/db/builds');
    const { GET } = await import('./route');

    const project = createProject('Test Font');
    const build = createBuild(project.id, null as unknown as string, null as unknown as string, {});

    const downloadParams = Promise.resolve({ buildId: String(build.id) });
    const getResponse = await GET(new Request('http://localhost/api/builds/1/download?format=otf') as NextRequest, {
      params: downloadParams,
    });

    expect(getResponse.status).toBe(400);
  });
});
