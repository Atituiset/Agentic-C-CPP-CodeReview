import React from 'react';
import { Play, Activity, Server, Database, AlertTriangle, Cpu } from 'lucide-react';
import { NODES, NUM_SLOTS } from '../constants';

export default function PersonalDashboard({ isScanning, handleStartScan, scanMetrics, slots, onNodeClick }: any) {
  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
             Your Nodes
             <span className="text-[10px] font-bold uppercase tracking-wider bg-[#21262d] border border-[#30363d] px-2.5 py-0.5 rounded-full text-[#3fb950] flex items-center gap-1.5 shadow-sm">
               <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse"></span>
               Agent Active
             </span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Managing your personal NGA analysis instances across multiple machines</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="flex items-center gap-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-md active:scale-95"
          >
            {isScanning ? <Activity className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
            {isScanning ? 'Running Local Scan...' : 'Trigger Local Scan'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">

          {/* Quick Stats for single user */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0">
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex justify-between items-center shadow-sm relative overflow-hidden group">
                <div>
                  <div className="text-xs text-[#8b949e] font-semibold uppercase mb-1">Local Total Files</div>
                  <div className="text-2xl font-bold text-[#e6edf3] font-mono">{Math.floor(scanMetrics.totalFiles * 0.15).toLocaleString()}</div>
                </div>
                <Database className="text-[#3fb950]/20" size={32} />
             </div>
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex justify-between items-center shadow-sm relative overflow-hidden group">
                <div>
                  <div className="text-xs text-[#8b949e] font-semibold uppercase mb-1">Your SAST Alerts</div>
                  <div className="text-2xl font-bold text-[#e6edf3] font-mono">{Math.floor(scanMetrics.sastFindings * 0.4)}</div>
                </div>
                <AlertTriangle className="text-[#d29922]/20" size={32} />
             </div>
             <div className="bg-[#0d1117] border border-[#30363d] p-5 rounded-xl flex justify-between items-center shadow-sm relative overflow-hidden group">
                <div>
                  <div className="text-xs text-[#8b949e] font-semibold uppercase mb-1">Your Semantic Issues</div>
                  <div className="text-2xl font-bold text-[#e6edf3] font-mono">{Math.floor(scanMetrics.llmFindings * 0.2)}</div>
                </div>
                <Cpu className="text-[#a371f7]/20" size={32} />
             </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
                <Server size={18} className="text-[#8b949e]" /> Your Connected Machines
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {NODES.map((node) => {
                let load = '0%';
                let isPulse = false;
                if (node.state === 'active') {
                   const runningSlots = slots.filter((s:any) => s.status === 'running').length;
                   load = `${((runningSlots / NUM_SLOTS) * 100).toFixed(0)}%`;
                   isPulse = runningSlots > 0;
                }

                return (
                  <div
                    key={node.id}
                    onClick={() => onNodeClick(node.id)}
                    className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden flex flex-col shadow-sm cursor-pointer hover:border-[#58a6ff]/50 transition-all group"
                  >
                    <div className="p-5 flex-1 relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${node.state === 'active' ? 'bg-[#3fb950] ' + (isPulse ? 'animate-pulse' : '') : 'bg-[#d29922]'}`}></div>
                          <span className="font-mono text-[13px] font-bold text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">{node.id}</span>
                        </div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          node.state === 'active' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                          'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20'
                        }`}>{node.state}</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#58a6ff]">{node.ip}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8b949e]">Region</span>
                          <span className="text-[#c9d1d9]">{node.region}</span>
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
                            <div className={`h-full transition-all duration-300 ${node.state === 'active' ? 'bg-[#58a6ff]' : 'bg-transparent'}`} style={{ width: load }}></div>
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
    </div>
  );
}
