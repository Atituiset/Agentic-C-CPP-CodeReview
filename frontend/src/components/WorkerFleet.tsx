import React from 'react';
import { Server } from 'lucide-react';
import { NUM_SLOTS } from '../constants';

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

export default function WorkerFleet({
  activeConnections,
  onNodeClick,
  workers,
  workerSlots,
  onUpdateWorkerShowThinking,
}: {
  activeConnections: number;
  onNodeClick: (nodeId: string) => void;
  workers: any[];
  workerSlots: Record<string, SlotState[]>;
  onUpdateWorkerShowThinking?: (workerId: string, show: boolean) => void;
}) {
  const allWorkers = workers;

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
             <Server className="text-[#8b949e]" /> Worker Fleet
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Detailed status and specifications for all connected scanning nodes</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0d1117] text-[#8b949e] text-[11px] font-bold uppercase tracking-wider border-b border-[#30363d]">
              <tr>
                <th className="px-5 py-3">Node ID</th>
                <th className="px-5 py-3">IP Address</th>
                <th className="px-5 py-3">Hostname</th>
                <th className="px-5 py-3">Current Job</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Load</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {allWorkers.map((node: any) => {
                const slots = workerSlots[node.worker_id] || [];
                const runningSlots = slots.filter((s: any) => s.status === 'running').length;
                const loadPct = Math.round((runningSlots / NUM_SLOTS) * 100);
                const state = node.status === 'running' ? 'active' : node.status === 'idle' ? 'idle' : 'offline';

                return (
                  <tr key={node.worker_id} className="hover:bg-[#161b22] transition-colors group cursor-pointer" onClick={() => onNodeClick(node.worker_id)}>
                    <td className="px-5 py-4 font-mono text-[#58a6ff] text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${state === 'active' ? 'bg-[#3fb950]' : state === 'idle' ? 'bg-[#d29922]' : 'bg-[#f85149]'}`}></div>
                        {node.worker_id}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#e6edf3] text-xs font-mono">{node.ip_address || '127.0.0.1'}</td>
                    <td className="px-5 py-4 text-[#8b949e] text-xs">{node.hostname || 'localhost'}</td>
                    <td className="px-5 py-4 text-[#8b949e] text-xs font-mono">{node.current_job_id ? node.current_job_id.slice(0, 8) : '—'}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                        state === 'active' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                        state === 'idle' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' :
                        'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20'
                      }`}>{state}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-[#010409] h-1.5 rounded-full overflow-hidden border border-[#30363d]">
                          <div className="bg-[#58a6ff] h-full transition-all duration-300" style={{ width: `${loadPct}%` }}></div>
                        </div>
                        <span className="text-[10px] text-[#8b949e] tabular-nums">{loadPct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const current = node.show_thinking !== false;
                            onUpdateWorkerShowThinking?.(node.worker_id, !current);
                          }}
                          className="flex items-center gap-1.5 text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                          title="Toggle thinking logs"
                        >
                          <span className="hidden sm:inline">Thinking</span>
                          <span className={`w-7 h-4 rounded-full inline-block relative transition-colors ${node.show_thinking !== false ? 'bg-[#238636]' : 'bg-[#30363d]'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${node.show_thinking !== false ? 'translate-x-3' : 'translate-x-0'}`} />
                          </span>
                        </button>
                        <span className="text-[#58a6ff] hover:text-[#79c0ff] opacity-0 group-hover:opacity-100 transition-opacity text-xs">Inspect →</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {allWorkers.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[#8b949e] text-sm py-12">
              No workers registered.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
