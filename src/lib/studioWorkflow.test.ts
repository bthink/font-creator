import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/python/runPython', () => ({ runPythonTool: vi.fn() }));
const dataDir = path.resolve('./data-test-studio');

beforeEach(() => {
  vi.resetModules();
  process.env.DATA_DIR = dataDir;
});
afterEach(async () => {
  const { getDb } = await import('./db');
  getDb().close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

async function fixture() {
  const { createProject } = await import('./db/projects');
  const { addGlyphSetEntry } = await import('./db/glyphSets');
  const { createTemplateVersion } = await import('./db/templateVersions');
  const { createScan } = await import('./db/scans');
  const { createGlyph } = await import('./db/glyphs');
  const project = createProject('Studio test');
  const a = addGlyphSetEntry(project.id, 'a', 'single');
  const b = addGlyphSetEntry(project.id, 'b', 'single');
  const template = createTemplateVersion(project.id, {
    columns: 1,
    rows: 1,
    cellSizePt: 90,
    markerSizePt: 12,
    glyphSetIds: [a.id, b.id],
  });
  const scan = createScan(project.id, template.id, '/scan.png');
  const svgPath = path.join(dataDir, 'a.svg');
  fs.writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
  );
  const glyph = createGlyph(a.id, scan.id, svgPath, [0, 0, 150, 150]);
  return { project, a, b, scan, glyph, svgPath };
}
function scanRequest(pageIndex?: string) {
  const data = new FormData();
  data.append('file', new File(['scan'], 'scan.png', { type: 'image/png' }));
  if (pageIndex !== undefined) data.append('pageIndex', pageIndex);
  return new NextRequest('http://localhost/api/projects/1/scans', {
    method: 'POST',
    body: data,
  });
}

describe('studio workflow', () => {
  it('uses font units for detected widths', async () => {
    const { detectedAdvanceWidth } = await import('./glyphMetrics');
    expect(detectedAdvanceWidth(150)).toBe(500);
    expect(detectedAdvanceWidth(0)).toBe(0);
  });
  it('serves the actual glyph and blocks files outside the data directory', async () => {
    const { glyph } = await fixture();
    const { GET } = await import('../app/api/glyphs/[glyphId]/preview/route');
    const params = Promise.resolve({ glyphId: String(glyph.id) });
    const response = await GET(new Request('http://localhost/preview'), {
      params,
    });
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('<path');
    const { getDb } = await import('./db');
    getDb()
      .prepare('UPDATE glyphs SET svg_path = ? WHERE id = ?')
      .run(path.resolve('package.json'), glyph.id);
    expect(
      (await GET(new Request('http://localhost/preview'), { params })).status,
    ).toBe(403);
  });
  it('rejects invalid widths without changing a glyph', async () => {
    const { glyph } = await fixture();
    const { PATCH } = await import('../app/api/glyphs/[glyphId]/route');
    for (const width of [-1, 1.5, 5001, '300', null]) {
      const request = new NextRequest('http://localhost/glyph', {
        method: 'PATCH',
        body: JSON.stringify({
          advanceWidthOverride: width,
          status: 'approved',
        }),
      });
      expect(
        (
          await PATCH(request, {
            params: Promise.resolve({ glyphId: String(glyph.id) }),
          })
        ).status,
      ).toBe(400);
    }
    const { getGlyph } = await import('./db/glyphs');
    expect(getGlyph(glyph.id)?.status).toBe('pending');
  });
  it('maps the second scanned page to its own characters', async () => {
    const { project, b, scan: previousScan, svgPath } = await fixture();
    const { updateScanAlignment } = await import('./db/scans');
    updateScanAlignment(previousScan.id, 'aligned');
    const { runPythonTool } = await import('./python/runPython');
    vi.mocked(runPythonTool)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        cells: [{ index: 0, svg_path: svgPath, bbox: [0, 0, 50, 60] }],
      });
    const { POST } = await import('../app/api/projects/[id]/scans/route');
    const response = await POST(scanRequest(), {
      params: Promise.resolve({ id: String(project.id) }),
    });
    expect(response.status).toBe(200);
    const scan = await response.json();
    expect(scan.pageIndex).toBe(1);
    const { listGlyphsByScan } = await import('./db/glyphs');
    expect(listGlyphsByScan(scan.id)[0].glyphSetId).toBe(b.id);
  });
  it('requires a new template after character set changes', async () => {
    const { project } = await fixture();
    const { addGlyphSetEntry } = await import('./db/glyphSets');
    addGlyphSetEntry(project.id, 'c', 'single');
    const { POST } = await import('../app/api/projects/[id]/scans/route');
    const response = await POST(scanRequest(), {
      params: Promise.resolve({ id: String(project.id) }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Zestaw znaków');
  });
  it('reports extraction failure instead of offering an empty successful review', async () => {
    const { project } = await fixture();
    const { runPythonTool } = await import('./python/runPython');
    vi.mocked(runPythonTool)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    const { POST } = await import('../app/api/projects/[id]/scans/route');
    const response = await POST(scanRequest(), {
      params: Promise.resolve({ id: String(project.id) }),
    });
    expect(response.status).toBe(422);
    const { listScans } = await import('./db/scans');
    expect(listScans(project.id)[0].alignmentStatus).toBe('failed');
  });
  it('builds only the newest approved version of a rescanned character', async () => {
    const { project, glyph, a, scan, svgPath } = await fixture();
    const { createGlyph, updateGlyphOverrides, listApprovedGlyphsForBuild } =
      await import('./db/glyphs');
    updateGlyphOverrides(glyph.id, {
      status: 'approved',
      advanceWidthOverride: 400,
    });
    const newer = createGlyph(a.id, scan.id, svgPath, [0, 0, 150, 150]);
    updateGlyphOverrides(newer.id, {
      status: 'approved',
      advanceWidthOverride: 600,
    });
    expect(listApprovedGlyphsForBuild(project.id)).toEqual([
      expect.objectContaining({ charValue: 'a', advanceWidthOverride: 600 }),
    ]);
    const { getProjectSummary } = await import('./db/projectSummary');
    expect(getProjectSummary(project.id).approved).toBe(1);
  });
  it('approves the current glyphs through the project endpoint', async () => {
    const { project, glyph } = await fixture();
    const { POST } = await import('../app/api/projects/[id]/glyphs/approve/route');
    const response = await POST(new Request('http://localhost/approve', { method: 'POST' }), {
      params: Promise.resolve({ id: String(project.id) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: 1 });
    const { getGlyph } = await import('./db/glyphs');
    expect(getGlyph(glyph.id)?.status).toBe('approved');
  });
  it('rejects a blank scan and does not count it as an uploaded page', async () => {
    const { project } = await fixture();
    const { runPythonTool } = await import('./python/runPython');
    vi.mocked(runPythonTool)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, cells: [] });
    const { POST } = await import('../app/api/projects/[id]/scans/route');
    const response = await POST(scanRequest('0'), { params: Promise.resolve({ id: String(project.id) }) });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('odręcznych');
    const { listScans, listUploadedPageIndexes } = await import('./db/scans');
    expect(listScans(project.id)[0].alignmentStatus).toBe('failed');
    expect(listUploadedPageIndexes(project.id, listScans(project.id)[0].templateVersionId, 1)).toEqual([]);
  });

  it('uses the stored page number even when sort orders have gaps and refreshes after deletion', async () => {
    const { project, scan, a } = await fixture();
    const { getDb } = await import('./db');
    const { updateScanAlignment, listUploadedPageIndexes, deleteScan } = await import('./db/scans');
    getDb().prepare('UPDATE scans SET page_index = 0 WHERE id = ?').run(scan.id);
    getDb().prepare('UPDATE glyph_set SET sort_order = 20 WHERE id = ?').run(a.id);
    updateScanAlignment(scan.id, 'aligned');
    expect(listUploadedPageIndexes(project.id, scan.templateVersionId, 1)).toEqual([0]);
    deleteScan(scan.id);
    expect(listUploadedPageIndexes(project.id, scan.templateVersionId, 1)).toEqual([]);
  });

  it('preserves the template version when downloading the same PDF again', async () => {
    const { project } = await fixture();
    const { POST } = await import('../app/api/projects/[id]/templates/route');
    const { getLatestTemplateVersion } = await import('./db/templateVersions');
    const context = { params: Promise.resolve({ id: String(project.id) }) };
    expect((await POST(new Request('http://localhost/template'), context)).status).toBe(200);
    const first = getLatestTemplateVersion(project.id)!;
    await POST(new Request('http://localhost/template'), context);
    expect(getLatestTemplateVersion(project.id)?.id).toBe(first.id);
    const { addGlyphSetEntry } = await import('./db/glyphSets');
    addGlyphSetEntry(project.id, 'c', 'single');
    await POST(new Request('http://localhost/template'), context);
    expect(getLatestTemplateVersion(project.id)?.id).toBeGreaterThan(first.id);
  });

  it('serves scan previews only for their project and inside the data directory', async () => {
    const { project, scan } = await fixture();
    const { getDb } = await import('./db');
    const { GET } = await import('../app/api/projects/[id]/scans/[scanId]/preview/route');
    const pngPath = path.join(dataDir, 'scan.png');
    fs.writeFileSync(pngPath, Buffer.from([137, 80, 78, 71]));
    getDb().prepare('UPDATE scans SET file_path = ? WHERE id = ?').run(pngPath, scan.id);
    const context = { params: Promise.resolve({ id: String(project.id), scanId: String(scan.id) }) };
    const response = await GET(new Request('http://localhost/preview'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fs.readFileSync(pngPath));
    expect((await GET(new Request('http://localhost/preview'), { params: Promise.resolve({ id: String(project.id + 1), scanId: String(scan.id) }) })).status).toBe(404);
    getDb().prepare('UPDATE scans SET file_path = ? WHERE id = ?').run(path.resolve('package.json'), scan.id);
    expect((await GET(new Request('http://localhost/preview'), context)).status).toBe(403);
    getDb().prepare('UPDATE scans SET file_path = ? WHERE id = ?').run(path.join(dataDir, 'missing.png'), scan.id);
    expect((await GET(new Request('http://localhost/preview'), context)).status).toBe(404);
  });

});
