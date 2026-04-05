'use client';

import { useState, useCallback } from 'react';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

interface Props {
  tree: FileEntry[];
  onFileSelect: (path: string) => void;
  onRefresh: () => void;
  selectedFile: string | null;
}

export default function FileExplorer({ tree, onFileSelect, onRefresh, selectedFile }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNewInput, setShowNewInput] = useState<'file' | 'directory' | null>(null);
  const [newName, setNewName] = useState('');

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleCreate = useCallback(async (type: 'file' | 'directory') => {
    if (!newName.trim()) return;
    await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, type }),
    });
    setNewName('');
    setShowNewInput(null);
    onRefresh();
  }, [newName, onRefresh]);

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isDir = entry.type === 'directory';
    const isOpen = expanded.has(entry.path);
    const isSelected = selectedFile === entry.path;

    return (
      <div key={entry.path}>
        <div
          className={`flex items-center gap-1.5 py-[4px] px-2 cursor-pointer text-[13px] hover:bg-zinc-800 transition-colors ${
            isSelected ? 'bg-zinc-800 text-white' : 'text-zinc-400'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (isDir) toggle(entry.path);
            else onFileSelect(entry.path);
          }}
        >
          {isDir ? (
            <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              {isOpen ? (
                <path d="M5.7 13.7a1 1 0 0 1 0-1.4L9.58 8 5.7 3.7a1 1 0 0 1 1.4-1.4l4.58 5a1 1 0 0 1 0 1.4l-4.58 5a1 1 0 0 1-1.4 0z"/>
              ) : (
                <path d="M6.3 3.3a1 1 0 0 1 1.4 0l4.58 4.58a1 1 0 0 1 0 1.4l-4.58 4.58a1 1 0 0 1-1.4-1.4L9.58 8.3 6.3 4.7a1 1 0 0 1 0-1.4z"/>
              )}
            </svg>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          {isDir ? (
            <svg className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'text-amber-500' : 'text-amber-600'}`} viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0 text-zinc-500" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.414a1 1 0 0 0-.293-.707l-2.414-2.414A1 1 0 0 0 10.586 2H4zm0 1h6.586L13 5.414V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
            </svg>
          )}
          <span className="truncate">{entry.name}</span>
        </div>
        {isDir && isOpen && entry.children?.map((child) => renderEntry(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Explorer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Explorer</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setShowNewInput('file'); setNewName(''); }}
            title="New File"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.5 1.1l3.4 3.5.1.4v10c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V2c0-.6.4-1 1-1h5.1l.4.1zM9 2H4v13h8V5.5L9 2z"/>
              <path d="M8 7h3v1H8v3H7V8H4V7h3V4h1v3z"/>
            </svg>
          </button>
          <button
            onClick={() => { setShowNewInput('directory'); setNewName(''); }}
            title="New Folder"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>
              <path d="M7 8h2v1H7v2H6V9H4V8h2V6h1v2z"/>
            </svg>
          </button>
          <button
            onClick={onRefresh}
            title="Refresh"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
              <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* New file/folder input */}
      {showNewInput && (
        <div className="px-3 py-2 border-b border-zinc-800 flex gap-1 flex-shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate(showNewInput);
              if (e.key === 'Escape') setShowNewInput(null);
            }}
            placeholder={showNewInput === 'file' ? 'filename.ts' : 'folder-name'}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <button
            onClick={() => handleCreate(showNewInput)}
            className="text-[10px] text-blue-400 hover:text-blue-300 px-1"
          >
            OK
          </button>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((entry) => renderEntry(entry))}
        {tree.length === 0 && (
          <p className="text-xs text-zinc-600 px-3 py-4 text-center">Empty workspace</p>
        )}
      </div>
    </div>
  );
}
