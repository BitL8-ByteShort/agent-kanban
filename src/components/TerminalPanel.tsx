'use client';

import { useEffect, useMemo, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Column, TerminalSessionSnapshot } from '@/lib/types';

type TerminalPanelProps = {
  agentColumns: Column[];
  selectedAgent: number;
  onSelectedAgentChange: (agentIndex: number) => void;
  session?: TerminalSessionSnapshot;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRefresh: () => Promise<void>;
};

export default function TerminalPanel({
  agentColumns,
  selectedAgent,
  onSelectedAgentChange,
  session,
  collapsed,
  onToggleCollapsed,
  onRefresh,
}: TerminalPanelProps) {
  const terminalRootRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputRef = useRef('');
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const selectedAgentRef = useRef(selectedAgent);
  const sessionStatusRef = useRef(session?.status || 'disconnected');

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
    sessionStatusRef.current = session?.status || 'disconnected';
  }, [selectedAgent, session?.status]);

  const selectedColumn = useMemo(
    () => agentColumns.find((column) => column.agentIndex === selectedAgent),
    [agentColumns, selectedAgent]
  );

  useEffect(() => {
    if (!terminalRootRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'var(--font-geist-mono), monospace',
      fontSize: 12,
      theme: {
        background: '#09090b',
        foreground: '#d4d4d8',
        cursor: '#60a5fa',
        selectionBackground: '#1e293b',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRootRef.current);
    fitAddon.fit();

    const inputDisposable = terminal.onData((data) => {
      if (sessionStatusRef.current === 'disconnected') return;
      if (shouldIgnoreTerminalInput(data)) return;
      void fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'input', agentIndex: selectedAgentRef.current, input: data }),
      });
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      if (sessionStatusRef.current === 'disconnected') return;
      fitAddonRef.current.fit();
      const dims = terminalRef.current;
      const nextSize = { cols: dims.cols, rows: dims.rows };
      if (
        lastResizeRef.current &&
        lastResizeRef.current.cols === nextSize.cols &&
        lastResizeRef.current.rows === nextSize.rows
      ) {
        return;
      }
      lastResizeRef.current = nextSize;
      void fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resize',
          agentIndex: selectedAgentRef.current,
          cols: dims.cols,
          rows: dims.rows,
        }),
      });
    });
    resizeObserver.observe(terminalRootRef.current);

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const output = session?.output || '';
    if (output === lastOutputRef.current) return;

    if (!lastOutputRef.current || !output.startsWith(lastOutputRef.current)) {
      terminal.reset();
      if (output) {
        terminal.write(output);
      }
    } else {
      terminal.write(output.slice(lastOutputRef.current.length));
    }
    lastOutputRef.current = output;
  }, [session?.output, session?.outputVersion]);

  useEffect(() => {
    lastOutputRef.current = '';
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.reset();
    if (session?.output) {
      terminal.write(session.output);
      lastOutputRef.current = session.output;
    }
  }, [selectedAgent]);

  const handleConnect = async () => {
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect', agentIndex: selectedAgent }),
    });
    await onRefresh();
  };

  const handleDisconnect = async () => {
    await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIndex: selectedAgent }),
    });
    await onRefresh();
  };

  const statusLabel = session?.status || 'disconnected';
  const interactiveSupported = session?.cli?.split(/\s+/)[0] === 'gemini';

  return (
    <div className="border-t border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleCollapsed}
            className="text-xs font-medium text-zinc-300 hover:text-white"
          >
            {collapsed ? 'Show Terminal' : 'Hide Terminal'}
          </button>
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-600">Interactive terminal</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(event) => onSelectedAgentChange(parseInt(event.target.value, 10))}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            {agentColumns.map((column) => (
              <option key={column.id} value={column.agentIndex ?? 0}>
                {column.title}
              </option>
            ))}
          </select>
          <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            {statusLabel}
          </span>
          <button
            onClick={handleConnect}
            disabled={
              !interactiveSupported ||
              session?.status === 'connecting' ||
              session?.status === 'ready' ||
              session?.status === 'busy'
            }
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            Connect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={session?.status === 'disconnected'}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:text-zinc-600 disabled:border-zinc-800"
          >
            Reset
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            <div>
              {selectedColumn?.title || 'Agent'} terminal
              {session?.model ? <span className="ml-2 text-zinc-600">{session.model}</span> : null}
            </div>
            <div>
              {interactiveSupported
                ? session?.status === 'connecting'
                  ? 'Finish trust/auth/welcome screens here. The session becomes ready once the normal Gemini prompt is visible.'
                  : 'Use this pane to trust the folder, finish OAuth, and watch raw CLI output.'
                : 'Interactive PTY mode is currently implemented for Gemini agents.'}
            </div>
          </div>
          <div className="h-64 px-2 pb-2">
            <div
              ref={terminalRootRef}
              className="h-full overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b] p-2"
            />
          </div>
          {session?.error && (
            <div className="px-4 pb-3 text-xs text-red-400">{session.error}</div>
          )}
        </>
      )}
    </div>
  );
}

function shouldIgnoreTerminalInput(input: string): boolean {
  return (
    /^\x1b\[\??[\d;]*c$/.test(input) ||
    input === '\x1b[I' ||
    input === '\x1b[O'
  );
}
