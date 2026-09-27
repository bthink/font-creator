import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('builds', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-builds';
  });

  afterEach(() => {
    fs.rmSync('./data-test-builds', { recursive: true, force: true });
  });

  async function setup() {
    const { createProject } = await import('./projects');
    return createProject('Test Project');
  }

  it('creates a build with paths and font metrics', async () => {
    const { createBuild } = await import('./builds');
    const project = await setup();

    const build = createBuild(project.id, '/path/out.otf', '/path/out.ttf', { unitsPerEm: 1000 });

    expect(build.projectId).toBe(project.id);
    expect(build.otfPath).toBe('/path/out.otf');
    expect(build.ttfPath).toBe('/path/out.ttf');
    expect(build.fontMetrics).toEqual({ unitsPerEm: 1000 });
  });

  it('lists builds for a project ordered by newest first', async () => {
    const { createBuild, listBuilds } = await import('./builds');
    const project = await setup();

    createBuild(project.id, '/path/a.otf', '/path/a.ttf', {});
    createBuild(project.id, '/path/b.otf', '/path/b.ttf', {});

    const builds = listBuilds(project.id);
    expect(builds).toHaveLength(2);
  });
});
