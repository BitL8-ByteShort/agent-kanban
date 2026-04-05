export interface AgentConfig {
  name: string;
  column: number; // 1-based index in the board (after "Ideas")
  cli?: string;   // override global CLI for this agent
  model?: string;
  skills?: string[];
  system_prompt?: string;
  max_concurrent?: number; // default 1
  execution_mode?: 'oneshot' | 'session';
  on_complete?: 'move_to_review' | 'stay' | 'archive';
}

export interface AppConfig {
  cli: string; // global default CLI command
  model?: string; // global default model
  workspace?: string; // project directory (defaults to cwd)
  agents: AgentConfig[];
}

export interface Card {
  id: string;
  title: string;
  instructions: string;
  columnId: string; // matches column id (ideas, agent-0, review, archive, or custom)
  status: 'queued' | 'active' | 'done' | 'failed';
  output: string;
  answer?: string;
  details?: string;
  error: string;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  columnId: string;
  columnTitle: string;
  enteredAt: string;
}

export interface Column {
  id: string;
  title: string;
  type: 'ideas' | 'agent' | 'review' | 'archive';
  agentIndex?: number; // index into agents array if type is 'agent'
}

export type TerminalSessionStatus = 'disconnected' | 'connecting' | 'ready' | 'busy' | 'error';

export interface TerminalSessionSnapshot {
  agentIndex: number;
  cli: string;
  model?: string;
  status: TerminalSessionStatus;
  error?: string;
  outputVersion: number;
  output: string;
  activeCardId?: string;
  startedAt?: string;
  updatedAt?: string;
}
