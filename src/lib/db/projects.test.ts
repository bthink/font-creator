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
