'use client';

import { useState, useEffect } from 'react';
import { basename } from 'path';

interface Props {
  filePath: string | null;
  workspace: string;
}

export default function FileViewer({ filePath, workspace }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!filePath) { setContent(null); return; }
    setLoading(true);
    fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.content !== undefined) {
          setContent(data.content);
          setDirty(false);
        } else {
          setContent(`// ${data.error || 'Cannot read file'}`);
        }
      })
      .finally(() => setLoading(false));
  }, [filePath]);

  const handleSave = async () => {
    if (!filePath || content === null) return;
    await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    setDirty(false);
  };

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-700 text-sm">
        Click a file to view it
      </div>
    );
  }

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center">
          <div className="px-3 py-1.5 text-xs text-zinc-300 border-b-2 border-blue-500 bg-zinc-900">
            {fileName}
            {dirty && <span className="ml-1 text-zinc-500">●</span>}
          </div>
        </div>
        <div className="flex gap-1 pr-2">
          {dirty && (
            <button
              onClick={handleSave}
              className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-zinc-600 text-sm font-mono">Loading...</div>
        ) : (
          <textarea
            value={content || ''}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
              }
            }}
            className="w-full h-full bg-[#0d0d0d] text-zinc-300 text-[13px] font-mono p-4 resize-none focus:outline-none leading-relaxed"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
