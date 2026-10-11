import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scan delete route', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-scan-delete-route';
  });

  afterEach(() => {
    fs.rmSync('./data-test-scan-delete-route', { recursive: true, force: true });
  });

  it('deletes the scan row and its files on disk', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan, getScan } = await import('@/lib/db/scans');
    const { DELETE } = await import('./route');

    const project = createProject('Test Project');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });

    const scanDir = path.resolve('./data-test-scan-delete-route', 'scans');
    fs.mkdirSync(scanDir, { recursive: true });
    const alignedPath = path.join(scanDir, 'aligned-123.png');
    fs.writeFileSync(alignedPath, 'fake-png');
    const scan = createScan(project.id, templateVersion.id, alignedPath, 'page-01.png');
    const glyphDir = path.join(scanDir, `glyphs-${scan.id}`);
    fs.mkdirSync(glyphDir, { recursive: true });
    fs.writeFileSync(path.join(glyphDir, 'a.svg'), '<svg></svg>');

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: String(project.id), scanId: String(scan.id) }),
    });

    expect(response.status).toBe(200);
    expect(getScan(scan.id)).toBeUndefined();
    expect(fs.existsSync(alignedPath)).toBe(false);
    expect(fs.existsSync(glyphDir)).toBe(false);
  });

  it('returns 404 for a scan belonging to another project', async () => {
    const { createProject } = await import('@/lib/db/projects');
    const { createTemplateVersion } = await import('@/lib/db/templateVersions');
    const { createScan } = await import('@/lib/db/scans');
    const { DELETE } = await import('./route');

    const project = createProject('Project A');
    const otherProject = createProject('Project B');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });
    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: String(otherProject.id), scanId: String(scan.id) }),
    });

    expect(response.status).toBe(404);
  });
});
