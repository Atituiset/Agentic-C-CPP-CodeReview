import React from 'react';
import { Play, Activity, Server } from 'lucide-react';
import { NUM_SLOTS } from '../constants';

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

interface WorkerInfo {
  id: string;
  worker_id: string;
  hostname?: string;
  ip_address?: string;
  status: string;
  current_job_id?: string | null;
  last_heartbeat?: string;
  capabilities?: Record<string, any>;
}

export default function DashboardMain({
  isScanning,
  handleStartScan,
  scanMetrics,
  activeConnections,
  onNodeClick,
  workers,
  workerSlots,
}: {
  isScanning: boolean;
  handleStartScan: () => void;
  scanMetrics: { totalFiles: number; sastFindings: number; llmFindings: number };
  activeConnections: number;
  onNodeClick: (nodeId: string) => void;
  workers: WorkerInfo[];
  workerSlots: Record<string, SlotState[]>;
}) {
  // Combine local + API workers for display
  const localSlots = workerSlots['local'] || [];
  const localRunning = localSlots.filter((s: any) => s.status === 'running').length;
  const localStatus = localRunning > 0 ? 'running' : 'idle';

  const allWorkers: WorkerInfo[] = [
    { id: 'local', worker_id: 'local', hostname: 'localhost', ip_address: '127.0.0.1', status: localStatus },
    ...workers.filter(w => w.worker_id !== 'local'),
  ];

  return (
    <>
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
             Centralized Dashboard
             <span className="text-[10px] font-bold uppercase tracking-wider bg-[#21262d] border border-[#30363d] px-2.5 py-0.5 rounded-full text-[#3fb950] flex items-center gap-1.5 shadow-sm">
               <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse"></span>
               System Online
             </span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Hybrid Distribution Engine monitoring multiple physical worker nodes</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="flex items-center gap-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-md active:scale-95"
          >
            {isScanning ? <Activity className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
            {isScanning ? 'Distributing Global Scan...' : 'Trigger Global MR Scan'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex flex-col justify-center shadow-sm relative overflow-hidden group hover:border-[#8b949e] transition-colors">
                <div className="text-xs text-[#8b949e] font-semibold uppercase mb-2">Total Files Scanned</div>
                <div className="text-3xl font-bold text-[#e6edf3] font-mono">{scanMetrics.totalFiles.toLocaleString()}</div>
             </div>
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex flex-col justify-center shadow-sm relative overflow-hidden group hover:border-[#3fb950]/50 transition-colors">
                <div className="text-xs text-[#3fb950] font-semibold uppercase mb-2">Local SAST Findings</div>
                <div className="text-3xl font-bold text-[#e6edf3] font-mono">{scanMetrics.sastFindings}</div>
             </div>
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex flex-col justify-center shadow-sm relative overflow-hidden group hover:border-[#a371f7]/50 transition-colors">
                <div className="text-xs text-[#a371f7] font-semibold uppercase mb-2">LLM Semantic Findings</div>
                <div className="text-3xl font-bold text-[#e6edf3] font-mono">{scanMetrics.llmFindings}</div>
             </div>
             <div className="bg-gradient-to-br from-[#1f6feb]/10 to-[#0d1117] border border-[#1f6feb]/30 p-5 rounded-xl flex flex-col justify-center shadow-inner relative overflow-hidden">
                <div className="text-xs text-[#58a6ff] font-semibold uppercase mb-2 z-10">Saved LLM Inference Cost</div>
                <div className="text-3xl font-bold text-[#e6edf3] font-mono z-10 border-b-2 border-[#58a6ff]/50 w-max">~78.4%</div>
             </div>
          </div>

          {/* Connected Worker Nodes */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
                <Server size={18} className="text-[#8b949e]" /> Registered Worker Fleet ({allWorkers.length} nodes)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {allWorkers.map((node) => {
                const slots = workerSlots[node.worker_id] || [];
                const runningSlots = slots.filter((s: any) => s.status === 'running').length;
                const load = `${((runningSlots / NUM_SLOTS) * 100).toFixed(0)}%`;
                const isPulse = runningSlots > 0;
                const state = node.status === 'running' ? 'active' : node.status === 'idle' ? 'idle' : 'offline';

                return (
                  <div
                    key={node.worker_id}
                    onClick={() => onNodeClick(node.worker_id)}
                    className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden flex flex-col shadow-sm cursor-pointer hover:border-[#58a6ff]/50 transition-all group"
                  >
                    <div className="p-5 flex-1 relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${state === 'active' ? 'bg-[#3fb950] ' + (isPulse ? 'animate-pulse' : '') : state === 'idle' ? 'bg-[#d29922]' : 'bg-[#484f58]'}`}></div>
                          <span className="font-mono text-[13px] font-bold text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">{node.worker_id}</span>
                        </div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          state === 'active' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                          state === 'idle' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' :
                          'text-[#8b949e] bg-[#21262d] border-[#30363d]'
                        }`}>{state}</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#58a6ff]">{node.ip_address || '127.0.0.1'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8b949e]">Hostname</span>
                          <span className="text-[#c9d1d9]">{node.hostname || 'localhost'}</span>
                        </div>
                         <div className="flex justify-between pb-1">
                          <span className="text-[#8b949e]">Agent Concurrency</span>
                          <span className="text-[#c9d1d9]">3 slots</span>
                        </div>
                        <div className="pt-2 border-t border-[#30363d]/50">
                          <div className="flex justify-between items-center mb-1 text-[10px] text-[#8b949e] uppercase font-bold">
                            <span>Process Load</span>
                            <span>{load}</span>
                          </div>
                          <div className="w-full bg-[#010409] h-1.5 rounded-full overflow-hidden border border-[#30363d]">
                            <div className={`h-full transition-all duration-300 ${state === 'active' ? 'bg-[#58a6ff]' : 'bg-transparent'}`} style={{ width: load }}></div>
                          </div>
                        </div>

                        <div className="mt-4 pt-2 border-t border-[#30363d]/30 text-right flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-[#8b949e]">Click to inspect</span>
                          <span className="text-xs text-[#58a6ff] hover:text-[#79c0ff] font-medium flex items-center gap-1">
                            View Node Details →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
