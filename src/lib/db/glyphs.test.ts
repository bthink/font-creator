import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('glyphs', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-glyphs';
  });

  afterEach(() => {
    fs.rmSync('./data-test-glyphs', { recursive: true, force: true });
  });

  async function setup() {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry } = await import('./glyphSets');
    const { createTemplateVersion } = await import('./templateVersions');
    const { createScan } = await import('./scans');

    const project = createProject('Test Project');
    const entry = addGlyphSetEntry(project.id, 'a', 'single');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    return { project, entry, scan };
  }

  it('creates a glyph with pending status by default', async () => {
    const { createGlyph } = await import('./glyphs');
    const { entry, scan } = await setup();

    const glyph = createGlyph(entry.id, scan.id, '/path/to/glyph.svg', [1, 2, 3, 4]);

    expect(glyph.glyphSetId).toBe(entry.id);
    expect(glyph.scanId).toBe(scan.id);
    expect(glyph.svgPath).toBe('/path/to/glyph.svg');
    expect(glyph.bboxRaw).toEqual([1, 2, 3, 4]);
    expect(glyph.status).toBe('pending');
  });

  it('lists glyphs by scan', async () => {
    const { createGlyph, listGlyphsByScan } = await import('./glyphs');
    const { entry, scan } = await setup();

    createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 10]);
    createGlyph(entry.id, scan.id, '/path/to/b.svg', [10, 10, 20, 20]);

    const glyphs = listGlyphsByScan(scan.id);
    expect(glyphs).toHaveLength(2);
  });

  it('updates glyph overrides and status', async () => {
    const { createGlyph, updateGlyphOverrides, listGlyphsByScan } = await import('./glyphs');
    const { entry, scan } = await setup();

    const glyph = createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 10]);
    const updatedResult = updateGlyphOverrides(glyph.id, { advanceWidthOverride: 500, status: 'approved' });

    const [updated] = listGlyphsByScan(scan.id);
    expect(updated.advanceWidthOverride).toBe(500);
    expect(updated.status).toBe('approved');
    expect(updated.leftBearingOverride).toBeNull();
    expect(updatedResult?.advanceWidthOverride).toBe(500);
  });

  it('returns undefined when updating a nonexistent glyph', async () => {
    const { updateGlyphOverrides } = await import('./glyphs');
    await setup();

    const result = updateGlyphOverrides(999999, { status: 'approved' });

    expect(result).toBeUndefined();
  });

  it('lists glyphs with their char label joined from glyph_set', async () => {
    const { createGlyph, listGlyphsWithCharLabel } = await import('./glyphs');
    const { entry, scan } = await setup();

    createGlyph(entry.id, scan.id, '/path/to/a.svg', [0, 0, 10, 10]);

    const glyphs = listGlyphsWithCharLabel(scan.id);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].charLabel).toBe(entry.charValue);
    expect(glyphs[0].bboxRaw).toEqual([0, 0, 10, 10]);
  });
});
