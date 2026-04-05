import { NextRequest, NextResponse } from 'next/server';
import { getConfig, updateConfigCli, updateConfigModel, getWorkspace } from '@/lib/config';
import { Column } from '@/lib/types';

export async function GET() {
  const config = getConfig();
  const workspace = getWorkspace();

  const columns: Column[] = [
    { id: 'ideas', title: 'Ideas', type: 'ideas' },
  ];

  config.agents.forEach((agent, i) => {
    columns.push({
      id: `agent-${i}`,
      title: agent.name,
      type: 'agent',
      agentIndex: i,
    });
  });

  columns.push({ id: 'review', title: 'Ready for Review', type: 'review' });
  columns.push({ id: 'archive', title: 'Archive', type: 'archive' });

  return NextResponse.json({ config, columns, workspace });
}

export async function PUT(req: NextRequest) {
  const payload = await req.json();
  if ('cli' in payload) updateConfigCli(payload.cli);
  if ('model' in payload) updateConfigModel(payload.model ?? '');
  return NextResponse.json({ ok: true, cli: payload.cli, model: payload.model });
}
