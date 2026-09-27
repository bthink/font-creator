import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/db/projects';
import { getLatestTemplateVersion } from '@/lib/db/templateVersions';
import { createScan, updateScanAlignment } from '@/lib/db/scans';
import { runPythonTool } from '@/lib/python/runPython';

const DATA_DIR = process.env.DATA_DIR ?? './data';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = Number(id);
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const templateVersion = getLatestTemplateVersion(projectId);
  if (!templateVersion) {
    return NextResponse.json({ error: 'no template generated yet' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const projectDir = path.join(DATA_DIR, 'projects', String(projectId), 'scans');
  await fs.mkdir(projectDir, { recursive: true });
  const rawPath = path.join(projectDir, `raw-${Date.now()}.png`);
  const alignedPath = path.join(projectDir, `aligned-${Date.now()}.png`);
  await fs.writeFile(rawPath, Buffer.from(await file.arrayBuffer()));

  const scan = createScan(projectId, templateVersion.id, alignedPath);
  const result = await runPythonTool('font_creator_tools.align_scan', [
    '--input',
    path.resolve(rawPath),
    '--output',
    path.resolve(alignedPath),
    '--marker-size-pt',
    String(templateVersion.gridConfig.markerSizePt),
  ]);
  updateScanAlignment(scan.id, result.ok ? 'aligned' : 'failed');

  return NextResponse.json({ ...scan, alignmentStatus: result.ok ? 'aligned' : 'failed' });
}
