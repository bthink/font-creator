import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

describe('scans', () => {
  beforeEach(() => {
    process.env.DATA_DIR = './data-test-scans';
  });

  afterEach(() => {
    fs.rmSync('./data-test-scans', { recursive: true, force: true });
  });

  it('creates a scan with pending alignment status by default', async () => {
    const { createProject } = await import('./projects');
    const { createTemplateVersion } = await import('./templateVersions');
    const { createScan } = await import('./scans');

    const project = createProject('Test Project');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });

    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');

    expect(scan).toBeDefined();
    expect(scan.projectId).toBe(project.id);
    expect(scan.templateVersionId).toBe(templateVersion.id);
    expect(scan.filePath).toBe('/path/to/scan.jpg');
    expect(scan.alignmentStatus).toBe('pending');
  });

  it('updates scan alignment status to aligned', async () => {
    const { createProject } = await import('./projects');
    const { createTemplateVersion } = await import('./templateVersions');
    const { createScan, updateScanAlignment } = await import('./scans');

    const project = createProject('Test Project');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });

    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    updateScanAlignment(scan.id, 'aligned');

    const { getDb } = await import('../db');
    const db = getDb();
    const row = db.prepare('SELECT alignment_status FROM scans WHERE id = ?').get(scan.id) as {
      alignment_status: string;
    };
    expect(row.alignment_status).toBe('aligned');
  });

  it('updates scan alignment status to failed', async () => {
    const { createProject } = await import('./projects');
    const { createTemplateVersion } = await import('./templateVersions');
    const { createScan, updateScanAlignment } = await import('./scans');

    const project = createProject('Test Project');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });

    const scan = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    updateScanAlignment(scan.id, 'failed');

    const { getDb } = await import('../db');
    const db = getDb();
    const row = db.prepare('SELECT alignment_status FROM scans WHERE id = ?').get(scan.id) as {
      alignment_status: string;
    };
    expect(row.alignment_status).toBe('failed');
  });

  it('retrieves a scan by id', async () => {
    const { createProject } = await import('./projects');
    const { createTemplateVersion } = await import('./templateVersions');
    const { createScan, getScan } = await import('./scans');

    const project = createProject('Test Project');
    const templateVersion = createTemplateVersion(project.id, {
      columns: 4,
      rows: 8,
      cellSizePt: 72,
      markerSizePt: 4,
    });

    const created = createScan(project.id, templateVersion.id, '/path/to/scan.jpg');
    const retrieved = getScan(created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.projectId).toBe(project.id);
    expect(retrieved?.templateVersionId).toBe(templateVersion.id);
  });

  it('returns undefined for nonexistent scan', async () => {
    const { getScan } = await import('./scans');
    const result = getScan(99999);
    expect(result).toBeUndefined();
  });
});
