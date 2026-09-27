import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/db/projects';

export function GET(): NextResponse {
  return NextResponse.json(listProjects());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { name?: string };
  if (!body.name || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  return NextResponse.json(createProject(body.name.trim()), { status: 201 });
}
