import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getWorkspace } from '@/lib/config';

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
  }

  const workspace = getWorkspace();
  const fullPath = join(workspace, filePath);

  // Safety: ensure path is within workspace
  if (!fullPath.startsWith(workspace)) {
    return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 });
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    return NextResponse.json({ content, path: filePath });
  } catch {
    return NextResponse.json({ error: 'Cannot read file (may be binary)' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const { path: filePath, content } = await req.json();
  if (!filePath || content === undefined) {
    return NextResponse.json({ error: 'path and content required' }, { status: 400 });
  }

  const workspace = getWorkspace();
  const fullPath = join(workspace, filePath);

  if (!fullPath.startsWith(workspace)) {
    return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 });
  }

  try {
    writeFileSync(fullPath, content, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
