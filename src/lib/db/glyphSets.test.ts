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

  it('bulk-inserts only characters not already present, skipping duplicates', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk, listGlyphSetEntries } = await import(
      './glyphSets'
    );
    const project = createProject('Bulk Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    const added = addGlyphSetEntriesBulk(project.id, ['a', 'b', 'c']);

    expect(added.map((entry) => entry.charValue)).toEqual(['b', 'c']);
    expect(added.every((entry) => entry.type === 'single')).toBe(true);
    expect(added.every((entry) => entry.componentChars === null)).toBe(true);
    expect(listGlyphSetEntries(project.id)).toHaveLength(3);
  });

  it('bulk-insert continues sort_order from the current max', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk, listGlyphSetEntries } = await import(
      './glyphSets'
    );
    const project = createProject('Sort Order Test');
    addGlyphSetEntry(project.id, 'x', 'single');
    addGlyphSetEntry(project.id, 'y', 'single');

    addGlyphSetEntriesBulk(project.id, ['z', 'w']);

    const entries = listGlyphSetEntries(project.id);
    expect(entries.map((entry) => entry.charValue)).toEqual(['x', 'y', 'z', 'w']);
    expect(entries.map((entry) => entry.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('bulk-insert with an empty or fully-duplicate list returns an empty array', async () => {
    const { createProject } = await import('./projects');
    const { addGlyphSetEntry, addGlyphSetEntriesBulk } = await import('./glyphSets');
    const project = createProject('Empty Bulk Test');
    addGlyphSetEntry(project.id, 'a', 'single');

    expect(addGlyphSetEntriesBulk(project.id, [])).toEqual([]);
    expect(addGlyphSetEntriesBulk(project.id, ['a'])).toEqual([]);
  });
});
