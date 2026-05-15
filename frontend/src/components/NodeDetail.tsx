import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Terminal as TerminalIcon, Network, Copy, Check } from 'lucide-react';
import { NUM_SLOTS } from '../constants';

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

export default function NodeDetail({ nodeId, onBack, workerSlots }: {
  nodeId: string;
  onBack: () => void;
  workerSlots: Record<string, SlotState[]>;
}) {
  const terminalRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null);

  const slots = workerSlots[nodeId] || Array.from({ length: NUM_SLOTS }, () => ({
    taskId: null, filePath: null, status: 'waiting', logs: []
  }));

  useEffect(() => {
    slots.forEach((_: any, i: number) => {
      const node = terminalRefs.current[i];
      if (node) {
         node.scrollTop = node.scrollHeight;
      }
    });
  }, [slots]);

  const copySlotLogs = async (slotIndex: number) => {
    const slot = slots[slotIndex];
    if (!slot || slot.logs.length === 0) return;
    const text = slot.logs.map((log: any) => log.raw).join('');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSlot(slotIndex);
      setTimeout(() => setCopiedSlot(null), 1500);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedSlot(slotIndex);
      setTimeout(() => setCopiedSlot(null), 1500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
      {/* Node Header */}
      <header className="px-6 py-4 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="p-1.5 rounded-md hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={16} /> <span className="text-xs font-semibold">Back</span>
              </button>
              <div className="h-6 w-px bg-[#30363d] hidden sm:block"></div>
            </>
          )}
          <div>
            <h1 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-3">
               Node Inspector
               <span className="font-mono text-xs bg-[#21262d] border border-[#30363d] px-2 py-0.5 rounded text-[#58a6ff]">{nodeId}</span>
            </h1>
            <p className="text-xs text-[#8b949e] mt-1">Viewing isolated NGA agent slots for this worker.</p>
          </div>
        </div>
      </header>

      {/* 3 Terminals View for the selected node */}
      <div className="flex-1 overflow-hidden p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#010409]">
        {slots.map((slot: any, i: number) => (
          <div key={i} className="flex-1 flex flex-col bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden min-w-0 shadow-lg relative">
            {/* Terminal Tab */}
            <div className="px-4 py-3 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f0f6fc] opacity-20 hidden lg:inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#f0f6fc] opacity-20 hidden lg:inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#f0f6fc] opacity-20 hidden lg:inline-block"></span>
                <div className="lg:ml-2 font-mono text-[11px] text-[#8b949e] font-semibold flex items-center gap-1.5"><TerminalIcon size={12}/> SLOT_{i}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {slot.filePath && (
                  <span className="bg-[#21262d] px-2 py-1 rounded text-[#e6edf3] truncate border border-[#30363d] max-w-[150px] text-right" title={slot.filePath}>
                    {slot.taskId && <span className="text-[#8b949e] mr-1">[{slot.taskId}]</span>}
                    {slot.filePath.split('/').pop()}
                  </span>
                )}
                {slot.logs.length > 0 && (
                  <button
                    onClick={() => copySlotLogs(i)}
                    className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                    title="Copy logs"
                  >
                    {copiedSlot === i ? <Check size={12} className="text-[#3fb950]" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>

            {/* Terminal Body */}
            <div
              ref={el => terminalRefs.current[i] = el}
              className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[1.6] break-all whitespace-pre-wrap select-text custom-scrollbar text-[#e6edf3]"
            >
               {slot.logs.map((log: any) => (
                  <div key={log.id} dangerouslySetInnerHTML={{ __html: log.html }} />
               ))}
               {slot.logs.length === 0 && slot.status === 'waiting' && (
                  <div className="h-full flex flex-col gap-3 items-center justify-center text-[#484f58] italic select-none">
                     <Network size={24} className="opacity-50" />
                     Task queue empty. Awaiting orchestrator payload...
                  </div>
               )}
            </div>

            {/* Visual Status Indicator strip at bottom of terminal */}
            {slot.status !== 'waiting' && (
              <div className={`h-1 w-full absolute bottom-0 left-0 ${
                  slot.status === 'running' ? 'bg-[#3fb950] animate-pulse' :
                  slot.status === 'done' ? 'bg-[#58a6ff]' :
                  slot.status === 'failed' ? 'bg-[#f85149]' : 'bg-transparent'
              }`}></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
