import { spawn, ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { getConfig, getWorkspace } from './config';
import { updateCard, getAllCards } from './store';
import { AgentConfig } from './types';
import { getDefaultModelForCli, normalizeModelForCli } from './model-options';
import { buildDisplayDetails, extractAnswerText, getPreferredCardText } from './output-utils';

const activeProcesses = new Map<string, ChildProcess>();
const CODEX_NOISE_PATTERNS = [
  /^Reading additional input from stdin\.\.\.$/i,
  /skipping duplicate plugin MCP server name/i,
  /Failed to delete shell snapshot/i,
  /worker quit with fatal: Transport channel closed, when AuthRequired/i,
  /Missing or invalid access token/i,
  /No access token was provided in this request/i,
  /resource_metadata="https:\/\/mcp\.(cloudflare|supabase)\.com/i,
  /resource_metadata=https:\/\/mcp\.stripe\.com/i,
];
const GEMINI_NOISE_PATTERNS = [
  /^Loaded cached credentials\.?$/i,
];

interface PreflightFailure {
  error: string;
  details?: string;
}

export function isAgentBusy(agentIndex: number): boolean {
  const cards = getAllCards();
  const config = getConfig();
  const agent = config.agents[agentIndex];
  if (!agent) return false;
  const columnId = `agent-${agentIndex}`;
  return cards.some((c) => c.columnId === columnId && c.status === 'active');
}

export function executeCard(cardId: string, agentIndex: number): void {
  const config = getConfig();
  const agent = config.agents[agentIndex];
  if (!agent) throw new Error(`Agent at index ${agentIndex} not found`);

  const cards = getAllCards();
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not found`);

  const cli = agent.cli || config.cli;
  const columnId = `agent-${agentIndex}`;
  const baseCli = getBaseCli(cli);

  // Resolve {{Card Title}} references
  const resolvedInstructions = resolveCardRefs(card.instructions, cards);

  const rawModel = agent.model || config.model;
  const normalizedModel = normalizeModelForCli(baseCli, rawModel);
  const effectiveModel = normalizedModel || (baseCli === 'gemini' ? getDefaultModelForCli(baseCli) : undefined);
  const effectiveAgent = { ...agent, model: effectiveModel };

  const preflightFailure = getPreflightFailure(baseCli);
  if (preflightFailure) {
    updateCard(cardId, {
      status: 'failed',
      columnId,
      output: '',
      answer: '',
      details: preflightFailure.details || '',
      error: preflightFailure.error,
    });
    processQueue(agentIndex);
    return;
  }

  // Update card to active
  updateCard(cardId, { status: 'active', output: '', answer: '', details: '', error: '', columnId });

  // Gemini needs ~/.gemini directory
  if (baseCli === 'gemini') {
    const geminiDir = join(process.env.HOME || '/tmp', '.gemini');
    try { mkdirSync(geminiDir, { recursive: true }); } catch {}
  }

  // Build spawn command and args per CLI
  const { cmd, args: spawnArgs } = buildSpawnConfig(cli, effectiveAgent, resolvedInstructions);

  const proc = spawn(cmd, spawnArgs, {
    cwd: getWorkspace(),
    env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  activeProcesses.set(cardId, proc);

  // This app passes prompts as argv, not via stdin. Closing stdin prevents
  // CLIs like Codex from waiting indefinitely for additional piped input.
  try {
    proc.stdin?.end();
  } catch {}

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = sanitizeCliText(baseCli, chunk.toString());
    if (!text) return;
    stdout += text;
    const combined = combineStreams(stdout, stderr);
    updateCard(cardId, {
      output: combined,
      answer: extractAnswerText(combined, baseCli),
      details: buildDisplayDetails(combined, baseCli),
    });
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = sanitizeCliText(baseCli, chunk.toString());
    if (!text) return;
    stderr += text;
    const combined = combineStreams(stdout, stderr);
    updateCard(cardId, {
      output: combined,
      answer: extractAnswerText(combined, baseCli),
      details: buildDisplayDetails(combined, baseCli),
    });
  });

  proc.on('close', (code) => {
    activeProcesses.delete(cardId);
    const output = combineStreams(stdout, stderr);
    const answer = extractAnswerText(output, baseCli);
    const details = buildDisplayDetails(output, baseCli);

    if (code === 0) {
      updateCard(cardId, { status: 'done', output, answer, details });

      const on_complete = agent.on_complete || 'move_to_review';
      const targetCol = on_complete === 'archive' ? 'archive' : 'review';
      const targetTitle = on_complete === 'archive' ? 'Archive' : 'Ready for Review';
      updateCard(cardId, {
        columnId: targetCol,
        history: [
          ...(getAllCards().find((c) => c.id === cardId)?.history || []),
          { columnId: targetCol, columnTitle: targetTitle, enteredAt: new Date().toISOString() },
        ],
      });
    } else {
      updateCard(cardId, {
        status: 'failed',
        output,
        answer,
        details,
        error: classifyProcessFailure(baseCli, code, output),
      });
    }

    processQueue(agentIndex);
  });

  proc.on('error', (err) => {
    activeProcesses.delete(cardId);
    updateCard(cardId, { status: 'failed', error: err.message });
  });
}

export function killProcess(cardId: string): boolean {
  const proc = activeProcesses.get(cardId);
  if (!proc) return false;
  proc.kill('SIGTERM');
  activeProcesses.delete(cardId);
  updateCard(cardId, { status: 'failed', error: 'Killed by user' });
  return true;
}

export function getActiveCardIds(): string[] {
  return Array.from(activeProcesses.keys());
}

function processQueue(agentIndex: number): void {
  const columnId = `agent-${agentIndex}`;
  const cards = getAllCards();
  if (cards.some((c) => c.columnId === columnId && c.status === 'active')) return;
  const next = cards.find((c) => c.columnId === columnId && c.status === 'queued');
  if (!next) return;
  executeCard(next.id, agentIndex);
}

export function processAllQueues(): void {
  const config = getConfig();
  config.agents.forEach((_, i) => processQueue(i));
}

// Resolve {{Card Title}} references — injects the output of referenced cards
function resolveCardRefs(instructions: string, allCards: { title: string; output: string }[]): string {
  return instructions.replace(/\{\{(.+?)\}\}/g, (match, title) => {
    const trimmed = title.trim();
    const refCard = allCards.find((c) => c.title.toLowerCase() === trimmed.toLowerCase());
    if (!refCard) return match;
    const refText = getPreferredCardText(refCard);
    if (!refText) return `[Card "${trimmed}" has no output yet]`;
    return refText;
  });
}

// Build spawn command and args per CLI tool
function buildSpawnConfig(cli: string, agent: AgentConfig, prompt: string): { cmd: string; args: string[] } {
  const baseCli = getBaseCli(cli);

  // Build system prompt
  const systemParts: string[] = [];
  if (agent.system_prompt) systemParts.push(agent.system_prompt);
  if (agent.skills?.length) systemParts.push(`Refer to these skill files: ${agent.skills.join(', ')}`);
  const systemPrompt = systemParts.join('\n\n');

  // For CLIs without native system prompt support, prepend to prompt
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;

  switch (baseCli) {
    case 'claude':
      return {
        cmd: 'claude',
        args: [
          '--print',
          ...(agent.model ? ['--model', agent.model] : []),
          ...(systemPrompt ? ['--system-prompt', systemPrompt] : []),
          prompt,
        ],
      };

    case 'codex':
      // 'codex exec' is the non-interactive mode — no TTY required
      return {
        cmd: 'codex',
        args: [
          'exec',
          ...(agent.model ? ['--model', agent.model] : []),
          '--full-auto',
          fullPrompt,
        ],
      };

    case 'gemini':
      return {
        cmd: 'gemini',
        args: [
          '-p', fullPrompt,
          ...(agent.model ? ['-m', agent.model] : []),
        ],
      };

    default:
      return { cmd: cli, args: [fullPrompt] };
  }
}

function getBaseCli(cli: string): string {
  return cli.trim().split(/\s+/)[0] || cli;
}

function getPreflightFailure(baseCli: string): PreflightFailure | null {
  if (baseCli !== 'gemini') return null;
  return null;
}

function sanitizeCliText(baseCli: string, text: string): string {
  if (baseCli === 'gemini') {
    const endsWithNewline = text.endsWith('\n');
    const keptLines = text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !GEMINI_NOISE_PATTERNS.some((pattern) => pattern.test(line.trim())));

    if (keptLines.length === 0) return '';
    return `${keptLines.join('\n')}${endsWithNewline ? '\n' : ''}`;
  }

  if (baseCli !== 'codex') return text;

  const endsWithNewline = text.endsWith('\n');
  const keptLines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !CODEX_NOISE_PATTERNS.some((pattern) => pattern.test(line)));

  if (keptLines.length === 0) return '';
  return `${keptLines.join('\n')}${endsWithNewline ? '\n' : ''}`;
}

function combineStreams(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
}

function classifyProcessFailure(baseCli: string, code: number | null, output: string): string {
  if (baseCli === 'gemini' && /Please set an Auth method/i.test(output)) {
    return 'Gemini CLI is missing headless auth for `gemini -p`. Set `GEMINI_API_KEY` or configure Vertex/GCA auth before running Gemini from Agent Kanban.';
  }

  return `Process exited with code ${code ?? 'unknown'}`;
}
