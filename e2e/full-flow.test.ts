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
