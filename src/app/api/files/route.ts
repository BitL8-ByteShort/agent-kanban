import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';
import { getWorkspace } from '@/lib/config';

const IGNORED = new Set([
  'node_modules', '.git', '.next', '.DS_Store', '__pycache__',
  '.turbo', '.vercel', 'dist', '.cache', '.sass-cache',
]);

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

function readTree(dir: string, base: string, depth: number = 0): FileEntry[] {
  if (depth > 5) return []; // limit depth for perf

  const entries: FileEntry[] = [];
  let items;
  try {
    items = readdirSync(dir);
  } catch {
    return [];
  }

  // Sort: directories first, then files, alphabetically
  items.sort((a, b) => {
    const aStat = statSync(join(dir, a));
    const bStat = statSync(join(dir, b));
    if (aStat.isDirectory() && !bStat.isDirectory()) return -1;
    if (!aStat.isDirectory() && bStat.isDirectory()) return 1;
    return a.localeCompare(b);
  });

  for (const item of items) {
    if (IGNORED.has(item) || item.startsWith('.')) continue;

    const fullPath = join(dir, item);
    const relPath = relative(base, fullPath);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      entries.push({
        name: item,
        path: relPath,
        type: 'directory',
        children: readTree(fullPath, base, depth + 1),
      });
    } else {
      entries.push({
        name: item,
        path: relPath,
        type: 'file',
      });
    }
  }

  return entries;
}

export async function GET(req: NextRequest) {
  const workspace = getWorkspace();
  const tree = readTree(workspace, workspace);
  return NextResponse.json({ workspace, tree });
}

export async function POST(req: NextRequest) {
  const { name, type, parentPath } = await req.json();
  const workspace = getWorkspace();
  const fullPath = parentPath
    ? join(workspace, parentPath, name)
    : join(workspace, name);

  if (existsSync(fullPath)) {
    return NextResponse.json({ error: 'Already exists' }, { status: 409 });
  }

  try {
    if (type === 'directory') {
      mkdirSync(fullPath, { recursive: true });
    } else {
      writeFileSync(fullPath, '', 'utf-8');
    }
    return NextResponse.json({ ok: true, path: relative(workspace, fullPath) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
