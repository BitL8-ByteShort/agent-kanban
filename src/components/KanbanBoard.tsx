'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Card, Column } from '@/lib/types';
import type { TerminalSessionSnapshot } from '@/lib/types';
import { getDefaultModelForCli, getSuggestedModelsForCli, resolveModelForCli } from '@/lib/model-options';
import { getPreferredCardText } from '@/lib/output-utils';
import FileExplorer, { FileEntry } from './FileExplorer';
import FileViewer from './FileViewer';
import TerminalPanel from './TerminalPanel';

const CLI_OPTIONS = [
  { id: 'claude', label: 'Claude', color: 'bg-orange-500' },
  { id: 'codex', label: 'Codex', color: 'bg-green-500' },
];

export default function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingCard, setViewingCard] = useState<Card | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatAgent, setChatAgent] = useState(0); // index into columns of agent type
  const [newCard, setNewCard] = useState({ title: '', instructions: '' });
  const [showNewCard, setShowNewCard] = useState(false);
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [activeCli, setActiveCli] = useState('claude');
  const [activeModel, setActiveModel] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  // Panel sizes
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [viewerHeight, setViewerHeight] = useState(200);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [showRunDetails, setShowRunDetails] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);
  const [terminalAgent, setTerminalAgent] = useState(0);
  const [sessionSnapshots, setSessionSnapshots] = useState<TerminalSessionSnapshot[]>([]);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const sessionPollRef = useRef<NodeJS.Timeout | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Resize refs
  const isResizingSidebar = useRef(false);
  const isResizingViewer = useRef(false);

  // Sidebar resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar.current) {
        const newWidth = Math.max(140, Math.min(500, e.clientX));
        setSidebarWidth(newWidth);
      }
      if (isResizingViewer.current) {
        const newHeight = Math.max(100, Math.min(window.innerHeight - 200, window.innerHeight - e.clientY));
        setViewerHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      isResizingSidebar.current = false;
      isResizingViewer.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startResizeViewer = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingViewer.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const fetchBoard = useCallback(async () => {
    const [cardsRes, configRes] = await Promise.all([
      fetch('/api/cards'),
      fetch('/api/config'),
    ]);
    setCards(await cardsRes.json());
    const configData = await configRes.json();
    const resolvedCli = configData.config?.cli || 'claude';
    const resolvedUiCli = CLI_OPTIONS.some((option) => option.id === resolvedCli) ? resolvedCli : CLI_OPTIONS[0].id;
    const resolvedModel = resolveModelForCli(resolvedUiCli, configData.config?.model);
    setColumns(configData.columns);
    setWorkspace(configData.workspace || '');
    setActiveCli(resolvedUiCli);
    setActiveModel(resolvedModel);
    setLoading(false);
  }, []);

  const fetchTree = useCallback(async () => {
    const res = await fetch('/api/files');
    const data = await res.json();
    setFileTree(data.tree || []);
    if (data.workspace) setWorkspace(data.workspace);
  }, []);

  const fetchSessions = useCallback(async () => {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    setSessionSnapshots(data.sessions || []);
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchTree();
    fetchSessions();
  }, [fetchBoard, fetchTree, fetchSessions]);

  useEffect(() => {
    const hasLiveSession = sessionSnapshots.some((session) => session.status !== 'disconnected');
    if (!hasLiveSession) {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
      return;
    }

    sessionPollRef.current = setInterval(() => {
      fetchSessions();
    }, 1000);

    return () => {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    };
  }, [fetchSessions, sessionSnapshots]);

  useEffect(() => {
    const validAgentIndexes = columns
      .filter((column) => column.type === 'agent' && column.agentIndex !== undefined)
      .map((column) => column.agentIndex as number);

    if (validAgentIndexes.length === 0) return;
    if (!validAgentIndexes.includes(terminalAgent)) {
      setTerminalAgent(validAgentIndexes[0]);
    }
  }, [columns, terminalAgent]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current && viewingCard?.status === 'active') {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [viewingCard?.output, viewingCard?.status]);

  // Poll for active cards
  useEffect(() => {
    const hasActive = cards.some((c) => c.status === 'active');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const res = await fetch('/api/cards');
        const latest = await res.json();
        setCards(latest);
        if (viewingCard) {
          const updated = latest.find((c: Card) => c.id === viewingCard.id);
          if (updated) setViewingCard(updated);
        }
      }, 1000);
    } else if (!hasActive && pollRef.current) {
      fetchBoard();
      fetchTree();
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [cards, viewingCard, fetchBoard, fetchTree]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    const cardId = draggableId;
    const destColumnId = destination.droppableId;

    setCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, columnId: destColumnId, status: 'queued', output: '', answer: '', details: '', updatedAt: new Date().toISOString() } : c)
    );

    const destColumn = columns.find((col) => col.id === destColumnId);
    if (destColumn?.type === 'agent' && destColumn.agentIndex !== undefined) {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId: destColumnId, status: 'queued', output: '', answer: '', details: '',
          history: [...(cards.find((c) => c.id === cardId)?.history || []), { columnId: destColumnId, columnTitle: destColumn.title, enteredAt: new Date().toISOString() }],
        }),
      });
      const execRes = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, agentIndex: destColumn.agentIndex }),
      });
      if (!execRes.ok) {
        const data = await execRes.json().catch(() => ({}));
        alert(data.error || (execRes.status === 409 ? 'Agent is busy.' : 'Could not start the agent.'));
        fetchBoard();
        return;
      }
    } else {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId: destColumnId,
          history: [...(cards.find((c) => c.id === cardId)?.history || []), { columnId: destColumnId, columnTitle: destColumn?.title || destColumnId, enteredAt: new Date().toISOString() }],
        }),
      });
    }
    fetchBoard();
  };

  const handleCreateCard = async () => {
    if (!newCard.title.trim()) return;
    await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCard.title, instructions: newCard.instructions, columnId: 'ideas' }),
    });
    setNewCard({ title: '', instructions: '' });
    setShowNewCard(false);
    fetchBoard();
  };

  const handleDeleteCard = async (id: string) => {
    await fetch(`/api/cards/${id}`, { method: 'DELETE' });
    if (viewingCard?.id === id) setViewingCard(null);
    fetchBoard();
  };

  const handleKillCard = async (id: string) => {
    await fetch('/api/execute', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: id }),
    });
    fetchBoard();
  };

  const handleChatSend = async () => {
    if (!viewingCard || !chatInput.trim()) return;
    const card = viewingCard;
    const followUp = chatInput.trim();
    const agentIndex = chatAgent;
    const targetColumnId = `agent-${agentIndex}`;
    setChatInput('');

    // Build new instructions: original + previous answer context + follow-up
    const prevAnswer = getCardAnswer(card).slice(-3000);
    const newInstructions = `${card.instructions}\n\n--- Previous answer ---\n${prevAnswer || '[No previous answer yet]'}\n\n--- Follow-up ---\n${followUp}`;

    // Update card: new instructions, re-queued in selected agent column
    await fetch(`/api/cards/${card.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: newInstructions,
        columnId: targetColumnId,
        status: 'queued',
        output: '',
        answer: '',
        details: '',
        error: '',
        history: [
          ...card.history,
          { columnId: targetColumnId, columnTitle: columns.find((c) => c.id === targetColumnId)?.title || targetColumnId, enteredAt: new Date().toISOString() },
        ],
      }),
    });

    setViewingCard(null);

    const execRes = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: card.id, agentIndex }),
    });
    if (!execRes.ok) {
      const data = await execRes.json().catch(() => ({}));
      alert(data.error || 'Could not start follow-up run.');
    }

    fetchBoard();
  };

  const handleCliChange = async (cli: string) => {
    const defaultModel = getDefaultModelForCli(cli);
    await fetch('/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cli, model: defaultModel }),
    });
    setActiveCli(cli);
    setActiveModel(defaultModel);
    setShowCliDropdown(false);
  };

  const handleModelChange = async (model: string) => {
    await fetch('/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    setActiveModel(model);
  };

  const openTerminal = (card: Card) => {
    setViewingCard({ ...card });
    setShowRunDetails(false);
  };
  const getColumnCards = (columnId: string) => cards.filter((c) => c.columnId === columnId);
  const getCardAnswer = (card: Card) => getPreferredCardText(card);
  const getCardDetails = (card: Card) => card.details?.trim() || '';
  const agentColumns = columns.filter((column) => column.type === 'agent');
  const activeSession = sessionSnapshots.find((session) => session.agentIndex === terminalAgent);

  const getStatusBadge = (status: Card['status']) => {
    switch (status) {
      case 'active': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'done': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const currentCli = CLI_OPTIONS.find(c => c.id === activeCli) || CLI_OPTIONS[0];
  const workspaceName = workspace.split('/').pop() || 'workspace';

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* ===== HEADER ===== */}
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-white">Agent Kanban</h1>

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Show Explorer' : 'Hide Explorer'}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="4" height="12" rx="1"/>
              <rect x="7" y="2" width="8" height="12" rx="1"/>
            </svg>
          </button>

          {/* CLI Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowCliDropdown(!showCliDropdown)}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-800 hover:border-zinc-600 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${currentCli.color}`} />
              {currentCli.label}
              <svg className="w-3 h-3 text-zinc-600" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 5.646a.5.5 0 0 1 .708 0L8 8.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/></svg>
            </button>
            {showCliDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCliDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                  {CLI_OPTIONS.map((opt) => (
                    <button key={opt.id} onClick={() => handleCliChange(opt.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 ${activeCli === opt.id ? 'text-white' : 'text-zinc-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                      {opt.label}
                      {activeCli === opt.id && <span className="ml-auto text-zinc-600 text-xs">✓</span>}
                    </button>
                  ))}
                  <div className="border-t border-zinc-800 mt-1 pt-1">
                    <button onClick={() => { setShowCliDropdown(false); setSelectedFile('config.yaml'); setViewerOpen(true); }}
                      className="w-full text-left px-3 py-2 text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800">
                      Edit config.yaml...
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Model Dropdown */}
          <select
            value={activeModel}
            onChange={(e) => { setActiveModel(e.target.value); handleModelChange(e.target.value); }}
            className="text-xs text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded px-2.5 py-1.5 w-56 transition-colors focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {activeCli === 'gemini' ? (
              <option value="">Gemini CLI default</option>
            ) : null}
            {getSuggestedModelsForCli(activeCli).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-600 font-mono">{workspaceName}</span>
          <button onClick={() => setShowNewCard(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
            + New Card
          </button>
        </div>
      </header>

      {/* ===== MAIN LAYOUT ===== */}
      <div className="flex-1 flex overflow-hidden">

        {/* Collapsed sidebar icon strip */}
        {sidebarCollapsed && (
          <div className="w-12 border-r border-zinc-800 flex flex-col items-center pt-2 gap-1 flex-shrink-0 bg-zinc-950">
            <button onClick={() => setSidebarCollapsed(false)}
              title="Show Explorer"
              className="p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 overflow-hidden border-r border-zinc-800">
              <FileExplorer
                tree={fileTree}
                onFileSelect={(path) => { setSelectedFile(path); setViewerOpen(true); }}
                onRefresh={fetchTree}
                selectedFile={selectedFile}
              />
            </div>
            {/* Sidebar resize handle */}
            <div
              onMouseDown={startResizeSidebar}
              className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors flex-shrink-0"
            />
          </>
        )}

        {/* Center: Board + Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Kanban Board */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 p-4 overflow-x-auto flex-1 min-h-0">
              {columns.map((column) => {
                const colCards = getColumnCards(column.id);
                const hasActiveCard = colCards.some((c) => c.status === 'active');
                return (
                  <div key={column.id} className="flex-shrink-0 w-64 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{column.title}</h2>
                        {column.type === 'agent' && hasActiveCard && (
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-700">{colCards.length}</span>
                    </div>
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`flex-1 rounded-lg p-1.5 transition-colors min-h-[120px] ${snapshot.isDraggingOver ? 'bg-zinc-800/60' : 'bg-zinc-900/30'}`}>
                          {colCards.map((card, index) => (
                            <Draggable key={card.id} draggableId={card.id} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  onDoubleClick={(e) => { e.stopPropagation(); openTerminal(card); }}
                                  className={`bg-zinc-900 border rounded-md p-2.5 mb-1.5 cursor-grab active:cursor-grabbing transition-all select-none ${
                                    snapshot.isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/10' :
                                    card.status === 'active' ? 'border-blue-500/40' :
                                    card.status === 'failed' ? 'border-red-500/40' :
                                    card.status === 'done' ? 'border-green-500/30' : 'border-zinc-800'
                                  }`}>
                                  <div className="flex items-start justify-between gap-2 mb-0.5">
                                    <span className="text-xs font-medium text-zinc-200 leading-tight truncate">{card.title}</span>
                                    <span className={`text-[9px] px-1 py-0.5 rounded border flex-shrink-0 ${getStatusBadge(card.status)}`}>{card.status}</span>
                                  </div>
                                  {card.instructions && card.status === 'queued' && (
                                    <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-2">{card.instructions}</p>
                                  )}
                                  {card.status === 'active' && (
                                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-blue-400">
                                      <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" /> Working...
                                    </div>
                                  )}
                                  {card.status === 'done' && getCardAnswer(card) && (
                                    <p className="mt-1.5 text-[10px] text-zinc-600 line-clamp-1">
                                      {getCardAnswer(card).split('\n').filter((l: string) => l.trim()).slice(-1)[0] || 'Done'}
                                    </p>
                                  )}
                                  {card.status === 'failed' && card.error && (
                                    <p className="text-[10px] text-red-400 mt-0.5">{card.error}</p>
                                  )}
                                  <div className="flex gap-1 mt-1.5">
                                    {card.status === 'active' && (
                                      <button onClick={(e) => { e.stopPropagation(); handleKillCard(card.id); }}
                                        className="text-[9px] text-red-500/70 hover:text-red-300 px-1 rounded hover:bg-zinc-800 transition-colors">kill</button>
                                    )}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}
                                      aria-label={`Delete ${card.title}`}
                                      title="Delete card"
                                      className="inline-flex items-center justify-center rounded p-1 text-red-500/80 transition-colors hover:bg-zinc-800 hover:text-red-300"
                                    >
                                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                        <path d="M6 1.75A1.75 1.75 0 0 0 4.25 3.5v.5H2.5a.75.75 0 0 0 0 1.5h.568l.63 7.558A2.25 2.25 0 0 0 5.94 15h4.12a2.25 2.25 0 0 0 2.241-1.942l.63-7.558h.569a.75.75 0 0 0 0-1.5h-1.75v-.5A1.75 1.75 0 0 0 10 1.75H6Zm4.25 2.25v-.5a.25.25 0 0 0-.25-.25H6a.25.25 0 0 0-.25.25v.5h4.5Zm-4.06 2.25a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm3.62.75a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0V7Z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>

          {/* Viewer resize handle */}
          {viewerOpen && selectedFile && (
            <>
              <div onMouseDown={startResizeViewer}
                className="h-1 cursor-row-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors flex-shrink-0" />
              <div style={{ height: viewerHeight }} className="flex-shrink-0 overflow-hidden">
                <FileViewer filePath={selectedFile} workspace={workspace} />
              </div>
            </>
          )}
        </div>
      </div>

      <TerminalPanel
        agentColumns={agentColumns}
        selectedAgent={terminalAgent}
        onSelectedAgentChange={setTerminalAgent}
        session={activeSession}
        collapsed={terminalCollapsed}
        onToggleCollapsed={() => setTerminalCollapsed((prev) => !prev)}
        onRefresh={fetchSessions}
      />

      {/* ===== MODALS ===== */}

      {/* New Card */}
      {showNewCard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">New Card</h2>
            <input type="text" placeholder="Title" value={newCard.title}
              onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 mb-3 text-sm focus:outline-none focus:border-blue-500" autoFocus />
            <textarea placeholder="Instructions (the prompt sent to the agent)" value={newCard.instructions}
              onChange={(e) => setNewCard({ ...newCard, instructions: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 mb-2 text-sm h-40 resize-none focus:outline-none focus:border-blue-500" />
            {/* Card reference picker */}
            {cards.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const ref = `{{${e.target.value}}}`;
                    setNewCard((prev) => ({
                      ...prev,
                      instructions: prev.instructions ? `${prev.instructions}\n${ref}` : ref,
                    }));
                    e.target.value = "";
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">+ Reference a card...</option>
                  {cards
                    .filter((c) => c.status === 'done' && getCardAnswer(c))
                    .map((c) => (
                      <option key={c.id} value={c.title}>
                        {c.title}
                      </option>
                    ))}
                </select>
                <span className="text-[10px] text-zinc-600">{"Inserts {{Card Title}}"}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewCard(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white">Cancel</button>
              <button onClick={handleCreateCard} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal */}
      {viewingCard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setViewingCard(null)}
                    aria-label="Close card modal"
                    title="Close"
                    className="h-3 w-3 rounded-full bg-red-500/80 transition-opacity hover:opacity-100 opacity-90"
                  />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80 opacity-90" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80 opacity-90" />
                </div>
                <span className="text-sm font-medium text-zinc-300">{viewingCard.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusBadge(viewingCard.status)}`}>{viewingCard.status}</span>
              </div>
              <button onClick={() => setViewingCard(null)} className="text-zinc-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-zinc-700">Esc</button>
            </div>
            <div className="px-4 py-2.5 border-b border-zinc-800 max-h-[20vh] overflow-y-auto min-h-0">
              <span className="text-xs text-zinc-600 mr-2">$</span>
              <span className="text-xs text-zinc-400 whitespace-pre-wrap">{viewingCard.instructions}</span>
            </div>
            <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 bg-[#0d0d0d]">
              {getCardAnswer(viewingCard) ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Answer</div>
                    <pre className="text-[13px] text-zinc-100 whitespace-pre-wrap font-mono leading-relaxed">{getCardAnswer(viewingCard)}</pre>
                  </div>
                  {getCardDetails(viewingCard) && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60">
                      <button
                        onClick={() => setShowRunDetails((prev) => !prev)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 transition-colors"
                      >
                        <span>{showRunDetails ? 'Hide run details' : 'Show run details'}</span>
                        <span className="text-zinc-600">{showRunDetails ? '−' : '+'}</span>
                      </button>
                      {showRunDetails && (
                        <div className="border-t border-zinc-800 px-4 py-3">
                          <pre className="text-[12px] text-green-400/85 whitespace-pre-wrap font-mono leading-relaxed">{getCardDetails(viewingCard)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : viewingCard.status === 'active' ? (
                <div className="flex items-center gap-2 text-zinc-500 text-sm font-mono">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  Waiting for output...<span className="animate-pulse">_</span>
                </div>
              ) : (
                <p className="text-zinc-600 text-sm font-mono">No output yet.</p>
              )}
              {viewingCard.status === 'active' && getCardDetails(viewingCard) && !showRunDetails && (
                <div className="mt-3 text-[11px] text-zinc-600">Run details are updating in the background.</div>
              )}
              {viewingCard.status === 'active' && (getCardAnswer(viewingCard) || getCardDetails(viewingCard)) && (
                <span className="text-green-400/60 animate-pulse">_</span>
              )}
              {viewingCard.error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-sm text-red-400 font-mono">{viewingCard.error}</p>
                </div>
              )}
            </div>
            <div className="px-4 py-2.5 bg-zinc-800 border-t border-zinc-700 flex-shrink-0">
              <div className="flex gap-2 items-center">
                <select
                  value={chatAgent}
                  onChange={(e) => setChatAgent(parseInt(e.target.value, 10))}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {columns.filter((c) => c.type === 'agent').map((col) => (
                    <option key={col.id} value={col.agentIndex ?? 0}>
                      {col.title}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  placeholder={viewingCard.status === 'active' ? 'Type a follow-up (queued after current run)...' : 'Type a follow-up and press Enter...'}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Send
                </button>
                {viewingCard.status === 'active' && (
                  <button onClick={() => { handleKillCard(viewingCard.id); setViewingCard(null); }}
                    className="text-xs text-red-500 hover:text-red-300 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">Kill</button>
                )}
                <button onClick={() => navigator.clipboard.writeText(getCardAnswer(viewingCard))}
                  className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">Copy answer</button>
                {getCardDetails(viewingCard) && (
                  <button onClick={() => navigator.clipboard.writeText(getCardDetails(viewingCard))}
                    className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">Copy details</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
