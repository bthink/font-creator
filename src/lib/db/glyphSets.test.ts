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
