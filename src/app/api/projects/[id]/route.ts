import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(project);
}
