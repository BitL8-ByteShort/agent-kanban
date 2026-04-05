import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getConfig, getWorkspace } from './config';
import { updateCard, getAllCards } from './store';
import { buildDisplayDetails } from './output-utils';
import { getDefaultModelForCli, normalizeModelForCli } from './model-options';
import { AgentConfig, TerminalSessionSnapshot, TerminalSessionStatus } from './types';

type SessionRun = {
  cardId: string;
  markerId: string;
  outputStart: number;
  agent: AgentConfig;
};

type SessionState = {
  agentIndex: number;
  cli: string;
  model?: string;
  status: TerminalSessionStatus;
  error?: string;
  output: string;
  plainOutput: string;
  outputVersion: number;
  startedAt?: string;
  updatedAt?: string;
  process?: ChildProcessWithoutNullStreams;
  relayScriptPath?: string;
  activeCardId?: string;
  activeRun?: SessionRun;
};

declare global {
  var __agentKanbanSessions: Map<number, SessionState> | undefined;
}

const MAX_OUTPUT_CHARS = 250_000;
const ANSWER_START = 'AGENT_KANBAN_ANSWER_START_';
const ANSWER_END = 'AGENT_KANBAN_ANSWER_END_';
const GEMINI_READY_PATTERNS = [
  /Type your message or @path\/to\/file/i,
  /\?\s+for shortcuts/i,
  /Shift\+Tab to accept edits/i,
];

function getSessions(): Map<number, SessionState> {
  if (!globalThis.__agentKanbanSessions) {
    globalThis.__agentKanbanSessions = new Map();
  }
  return globalThis.__agentKanbanSessions;
}

function getBaseCli(cli: string): string {
  return cli.trim().split(/\s+/)[0] || cli;
}

function getExecutionMode(agentIndex: number): 'oneshot' | 'session' {
  const config = getConfig();
  const agent = config.agents[agentIndex];
  if (!agent) return 'oneshot';
  return agent.execution_mode || 'oneshot';
}

export function getAgentExecutionMode(agentIndex: number): 'oneshot' | 'session' {
  return getExecutionMode(agentIndex);
}

export function isSessionModeAgent(agentIndex: number): boolean {
  return getExecutionMode(agentIndex) === 'session';
}

export function getSessionSnapshot(agentIndex: number): TerminalSessionSnapshot {
  const config = getConfig();
  const agent = config.agents[agentIndex];
  const cli = agent?.cli || config.cli;
  const normalizedModel = normalizeModelForCli(getBaseCli(cli), agent?.model || config.model);
  const model = normalizedModel || (getBaseCli(cli) === 'gemini' ? getDefaultModelForCli(getBaseCli(cli)) : undefined);
  const session = getSyncedSession(agentIndex, cli);

  return {
    agentIndex,
    cli,
    model,
    status: session?.status || 'disconnected',
    error: session?.error,
    outputVersion: session?.outputVersion || 0,
    output: session?.output || '',
    activeCardId: session?.activeCardId,
    startedAt: session?.startedAt,
    updatedAt: session?.updatedAt,
  };
}

export function listSessionSnapshots(): TerminalSessionSnapshot[] {
  const config = getConfig();
  return config.agents.map((_, index) => getSessionSnapshot(index));
}

export async function connectSession(agentIndex: number): Promise<TerminalSessionSnapshot> {
  const config = getConfig();
  const agent = config.agents[agentIndex];
  if (!agent) throw new Error(`Agent at index ${agentIndex} not found`);

  const cli = agent.cli || config.cli;
  const baseCli = getBaseCli(cli);
  const normalizedModel = normalizeModelForCli(baseCli, agent.model || config.model);
  const model = normalizedModel || (baseCli === 'gemini' ? getDefaultModelForCli(baseCli) : undefined);

  if (baseCli !== 'gemini') {
    throw new Error(`Interactive sessions are currently implemented for Gemini agents only.`);
  }

  disconnectSession(agentIndex);

  const session: SessionState = {
    agentIndex,
    cli,
    model,
    status: 'connecting',
    output: '',
    plainOutput: '',
    outputVersion: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getSessions().set(agentIndex, session);

  const relayScriptPath = createExpectRelay(resolveExecutablePath(baseCli), model);
  session.relayScriptPath = relayScriptPath;

  const proc = spawn(resolveExecutablePath('expect'), [relayScriptPath], {
    cwd: getWorkspace(),
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  session.process = proc;
  session.status = 'connecting';
  session.updatedAt = new Date().toISOString();

  proc.stdout.on('data', (chunk: Buffer) => {
    appendSessionOutput(session, chunk.toString());
    maybeCompleteActiveRun(session);
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    appendSessionOutput(session, chunk.toString());
    maybeCompleteActiveRun(session);
  });

  proc.on('error', (error) => {
    session.status = 'error';
    session.error = error.message;
    session.updatedAt = new Date().toISOString();
  });

  proc.on('close', (code) => {
    session.process = undefined;
    session.status = code === 0 ? 'disconnected' : 'error';
    session.error = code === 0 ? undefined : `Session exited with code ${code}`;
    session.updatedAt = new Date().toISOString();
    if (session.relayScriptPath) {
      rmSync(session.relayScriptPath, { force: true });
      session.relayScriptPath = undefined;
    }

    if (session.activeRun) {
      const runText = session.plainOutput.slice(session.activeRun.outputStart);
      updateCard(session.activeRun.cardId, {
        status: 'failed',
        answer: '',
        details: buildDisplayDetails(runText, 'gemini'),
        output: '',
        error: session.error || 'Interactive Gemini session ended unexpectedly.',
      });
      session.activeRun = undefined;
      session.activeCardId = undefined;
    }
  });

  return getSessionSnapshot(agentIndex);
}

export function disconnectSession(agentIndex: number): void {
  const session = getSessions().get(agentIndex);
  if (!session) return;

  try {
    session.process?.kill('SIGTERM');
  } catch {}
  if (session.relayScriptPath) {
    rmSync(session.relayScriptPath, { force: true });
  }

  getSessions().delete(agentIndex);
}

export function resizeSession(_agentIndex: number, _cols: number, _rows: number): void {
  // Pipe-backed sessions do not have a real terminal size to resize.
}

export function sendTerminalInput(agentIndex: number, input: string): TerminalSessionSnapshot {
  const session = getSessions().get(agentIndex);
  if (!session?.process) {
    throw new Error('Session is not connected.');
  }

  if (shouldIgnoreTerminalInput(input)) {
    return getSessionSnapshot(agentIndex);
  }

  session.process.stdin.write(input);
  session.updatedAt = new Date().toISOString();
  return getSessionSnapshot(agentIndex);
}

export function submitCardToSession(cardId: string, agentIndex: number): void {
  const session = getSessions().get(agentIndex);
  if (!session?.process) {
    throw new Error('Interactive session is not connected. Connect the Gemini terminal first.');
  }

  if (!isPromptReady(session)) {
    throw new Error('Gemini is connected, but not at the prompt yet. Finish trust/auth and wait for the terminal prompt before sending a card.');
  }

  if (session.activeRun) {
    throw new Error('Interactive session is busy. Wait for the current card to finish.');
  }

  const config = getConfig();
  const agent = config.agents[agentIndex];
  if (!agent) throw new Error(`Agent at index ${agentIndex} not found`);

  const cards = getAllCards();
  const card = cards.find((item) => item.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not found`);

  const markerId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const wrappedPrompt = buildInteractivePrompt(agent, card.instructions, markerId);

  session.activeRun = {
    cardId,
    markerId,
    outputStart: session.plainOutput.length,
    agent,
  };
  session.activeCardId = cardId;
  session.status = 'busy';
  session.updatedAt = new Date().toISOString();

  updateCard(cardId, {
    status: 'active',
    output: '',
    answer: '',
    details: '',
    error: '',
  });

  session.process.stdin.write(`${wrappedPrompt}\r`);
}

function appendSessionOutput(session: SessionState, data: string): void {
  session.output = keepTail(session.output + data, MAX_OUTPUT_CHARS);
  session.plainOutput = keepTail(session.plainOutput + stripAnsi(data).replace(/\r/g, ''), MAX_OUTPUT_CHARS);
  session.outputVersion += 1;
  if (!session.activeRun && session.process) {
    session.status = isPromptReady(session) ? 'ready' : 'connecting';
    if (session.status === 'ready') {
      session.error = undefined;
    }
  }
  session.updatedAt = new Date().toISOString();
}

function maybeCompleteActiveRun(session: SessionState): void {
  const run = session.activeRun;
  if (!run) return;

  const runText = session.plainOutput.slice(run.outputStart);
  const answer = extractMarkedAnswer(runText, run.markerId);
  const details = buildDisplayDetails(runText, 'gemini');

  updateCard(run.cardId, {
    details,
    answer: answer || '',
    output: answer || '',
  });

  if (!answer) return;

  updateCard(run.cardId, {
    status: 'done',
    answer,
    details,
    output: answer,
    error: '',
  });

  const onComplete = run.agent.on_complete || 'move_to_review';
  const targetCol = onComplete === 'archive' ? 'archive' : 'review';
  const targetTitle = onComplete === 'archive' ? 'Archive' : 'Ready for Review';
  updateCard(run.cardId, {
    columnId: targetCol,
    history: [
      ...(getAllCards().find((card) => card.id === run.cardId)?.history || []),
      { columnId: targetCol, columnTitle: targetTitle, enteredAt: new Date().toISOString() },
    ],
  });

  session.activeRun = undefined;
  session.activeCardId = undefined;
  session.status = isPromptReady(session) ? 'ready' : 'connecting';
  session.error = undefined;
  session.updatedAt = new Date().toISOString();
}

function buildInteractivePrompt(agent: AgentConfig, prompt: string, markerId: string): string {
  const systemParts: string[] = [];
  if (agent.system_prompt) systemParts.push(agent.system_prompt);
  if (agent.skills?.length) systemParts.push(`Refer to these skill files: ${agent.skills.join(', ')}`);
  const systemPrompt = systemParts.join('\n\n');

  return [
    'Treat this as a fresh Agent Kanban task.',
    'Ignore any previous task context unless explicitly repeated below.',
    systemPrompt ? `System instructions:\n${systemPrompt}` : '',
    `Task:\n${prompt}`,
    `When your final answer is complete, output exactly:`,
    `<${ANSWER_START}${markerId}>`,
    '[your final answer here]',
    `<${ANSWER_END}${markerId}>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractMarkedAnswer(text: string, markerId: string): string {
  const start = `<${ANSWER_START}${markerId}>`;
  const end = `<${ANSWER_END}${markerId}>`;
  const endIndex = text.lastIndexOf(end);
  if (endIndex === -1) return '';

  const startIndex = text.lastIndexOf(start, endIndex);
  if (startIndex === -1) return '';

  return text.slice(startIndex + start.length, endIndex).trim();
}

function keepTail(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(value.length - maxChars);
}

function getSyncedSession(agentIndex: number, cli: string): SessionState | undefined {
  const session = getSessions().get(agentIndex);
  if (!session) return undefined;

  if (getBaseCli(cli) !== 'gemini') {
    disconnectSession(agentIndex);
    return undefined;
  }

  return session;
}

function shouldIgnoreTerminalInput(input: string): boolean {
  return (
    /^\x1b\[\??[\d;]*c$/.test(input) ||
    input === '\x1b[I' ||
    input === '\x1b[O'
  );
}

function isPromptReady(session: SessionState): boolean {
  return GEMINI_READY_PATTERNS.some((pattern) => pattern.test(session.plainOutput));
}

function resolveExecutablePath(command: string): string {
  try {
    return execFileSync('which', [command], {
      encoding: 'utf-8',
      env: process.env,
    }).trim();
  } catch {
    return command;
  }
}

function createExpectRelay(executable: string, model?: string): string {
  const relayDir = '/tmp/agent-kanban-relays';
  mkdirSync(relayDir, { recursive: true });
  const relayPath = join(relayDir, `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.expect`);
  const args = [executable, '--screen-reader', ...(model ? ['-m', model] : [])].map(tclQuote).join(' ');
  const script = `log_user 1
set timeout -1
spawn -noecho ${args}
interact
`;
  writeFileSync(relayPath, script, 'utf-8');
  return relayPath;
}

function tclQuote(value: string): string {
  return `{${value.replace(/[{}]/g, '\\$&')}}`;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
