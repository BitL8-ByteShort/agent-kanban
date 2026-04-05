import { NextRequest, NextResponse } from 'next/server';
import {
  connectSession,
  disconnectSession,
  getSessionSnapshot,
  listSessionSnapshots,
  resizeSession,
  sendTerminalInput,
} from '@/lib/session-manager';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const agentIndex = req.nextUrl.searchParams.get('agentIndex');
  if (agentIndex !== null) {
    return NextResponse.json(getSessionSnapshot(Number(agentIndex)));
  }

  return NextResponse.json({ sessions: listSessionSnapshots() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const agentIndex = Number(body.agentIndex);

  try {
    switch (body.action) {
      case 'connect':
        return NextResponse.json(await connectSession(agentIndex));

      case 'input':
        return NextResponse.json(sendTerminalInput(agentIndex, String(body.input || '')));

      case 'resize':
        resizeSession(agentIndex, Number(body.cols || 120), Number(body.rows || 32));
        return NextResponse.json(getSessionSnapshot(agentIndex));

      default:
        return NextResponse.json({ error: 'Unknown session action.' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown session error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  disconnectSession(Number(body.agentIndex));
  return NextResponse.json({ ok: true });
}
