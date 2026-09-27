import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>';

describe('builds route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-builds-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-builds-route', { recursive: true, force: true });
  });

  it('builds a real otf/ttf from approved glyphs via the route handlers', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { GET, POST } = await import('./route');

    const project = createProject('My Handwriting v2');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-builds-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPathT = path.join(svgDir, 't.svg');
    const svgPathI = path.join(svgDir, 'i.svg');
    const svgPathTi = path.join(svgDir, 'ti.svg');
    fs.writeFileSync(svgPathT, SVG);
    fs.writeFileSync(svgPathI, SVG);
    fs.writeFileSync(svgPathTi, SVG);

    const entryT = addGlyphSetEntry(project.id, 't', 'single');
    const entryI = addGlyphSetEntry(project.id, 'i', 'single');
    const entryTi = addGlyphSetEntry(project.id, 'ti', 'ligature', 'ti');

    const glyphT = createGlyph(entryT.id, scan.id, svgPathT, [0, 0, 100, 100]);
    updateGlyphOverrides(glyphT.id, { status: 'approved', advanceWidthOverride: 600 });
    const glyphI = createGlyph(entryI.id, scan.id, svgPathI, [0, 0, 100, 100]);
    updateGlyphOverrides(glyphI.id, { status: 'approved', advanceWidthOverride: 550 });
    const glyphTi = createGlyph(entryTi.id, scan.id, svgPathTi, [0, 0, 100, 100]);
    updateGlyphOverrides(glyphTi.id, { status: 'approved', advanceWidthOverride: 900 });

    const params = Promise.resolve({ id: String(project.id) });
    const postResponse = await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }), {
      params,
    });

    expect(postResponse.status).toBe(201);
    const build = await postResponse.json();
    expect(build.otfPath).toBeTruthy();
    expect(build.ttfPath).toBeTruthy();
    expect(fs.existsSync(build.otfPath)).toBe(true);
    expect(fs.existsSync(build.ttfPath)).toBe(true);

    // filename should be sanitized (no raw spaces/slashes from "My Handwriting v2")
    expect(path.basename(build.otfPath)).not.toContain(' ');

    const getResponse = await GET(new Request('http://localhost/api/projects/1/builds'), { params });
    const builds = await getResponse.json();
    expect(builds).toHaveLength(1);
    expect(builds[0].id).toBe(build.id);
  });

  it('converts bbox pixel width to font units when no advance-width override is set', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { addGlyphSetEntry } = await import('@/lib/db/glyphSets');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { createGlyph, updateGlyphOverrides } = await import('@/lib/db/glyphs');
    const { TEMPLATE_DPI } = await import('@/lib/pdf/generateTemplate');
    const { POST } = await import('./route');

    const project = createProject('Convert Test');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const svgDir = path.resolve('./data-test-builds-route', 'svgs');
    fs.mkdirSync(svgDir, { recursive: true });
    const svgPath = path.join(svgDir, 'x.svg');
    fs.writeFileSync(svgPath, SVG);

    const entry = addGlyphSetEntry(project.id, 'x', 'single');
    const bboxWidthPx = 300;
    const glyph = createGlyph(entry.id, scan.id, svgPath, [0, 0, bboxWidthPx, 100]);
    // No advanceWidthOverride -> fallback must convert px to font units.
    updateGlyphOverrides(glyph.id, { status: 'approved' });

    const params = Promise.resolve({ id: String(project.id) });
    await POST(new Request('http://localhost/api/projects/1/builds', { method: 'POST' }), { params });

    const buildDir = path.resolve('./data-test-builds-route', 'projects', String(project.id), 'builds');
    const specFile = fs.readdirSync(buildDir).find((f) => f.startsWith('spec-'));
    expect(specFile).toBeTruthy();
    const spec = JSON.parse(fs.readFileSync(path.join(buildDir, specFile!), 'utf-8'));
    const expected = Math.round(bboxWidthPx * (1000 / TEMPLATE_DPI));
    expect(spec.glyphs[0].advance_width).toBe(expected);
  });
});
