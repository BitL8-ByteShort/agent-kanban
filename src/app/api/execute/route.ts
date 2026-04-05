import { NextRequest, NextResponse } from 'next/server';
import { executeCard, killProcess, isAgentBusy, getActiveCardIds, processAllQueues } from '@/lib/agent-runner';
import { isSessionModeAgent, submitCardToSession } from '@/lib/session-manager';

export const runtime = 'nodejs';

// On first load, process any orphaned queued cards
let initialized = false;
function ensureInit() {
  if (!initialized) {
    initialized = true;
    processAllQueues();
  }
}

export async function POST(req: NextRequest) {
  const { cardId, agentIndex } = await req.json();

  // Check if agent already has an active card
  if (isAgentBusy(agentIndex)) {
    return NextResponse.json(
      { error: 'Agent is busy. Wait for the current task to finish.' },
      { status: 409 }
    );
  }

  try {
    if (isSessionModeAgent(agentIndex)) {
      submitCardToSession(cardId, agentIndex);
    } else {
      executeCard(cardId, agentIndex);
    }
    return NextResponse.json({ ok: true, cardId, agentIndex });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { cardId } = await req.json();
  const ok = killProcess(cardId);
  return NextResponse.json({ ok });
}

export async function GET() {
  ensureInit();
  return NextResponse.json({ active: getActiveCardIds() });
}
