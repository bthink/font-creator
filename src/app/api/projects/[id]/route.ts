import { NextResponse } from 'next/server';
import { archiveProject, getProject } from '@/lib/db/projects';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const archived = archiveProject(Number(id));
  return NextResponse.json(archived);
}
