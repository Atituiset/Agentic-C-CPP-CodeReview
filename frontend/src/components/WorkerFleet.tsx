import React from 'react';
import { Server } from 'lucide-react';
import { NODES } from '../constants';

export default function WorkerFleet({ activeConnections, onNodeClick }: any) {
  const allNodes = NODES;

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
                <th className="px-5 py-3">Region</th>
                <th className="px-5 py-3">Environment</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {allNodes.map((node) => (
                <tr key={node.id} className="hover:bg-[#161b22] transition-colors group cursor-pointer" onClick={() => onNodeClick(node.id)}>
                  <td className="px-5 py-4 font-mono text-[#58a6ff] text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${node.state === 'active' ? 'bg-[#3fb950]' : node.state === 'idle' ? 'bg-[#d29922]' : 'bg-[#f85149]'}`}></div>
                      {node.id}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#e6edf3] text-xs font-mono">{node.ip}</td>
                  <td className="px-5 py-4 text-[#8b949e] text-xs">{node.region}</td>
                  <td className="px-5 py-4 text-[#8b949e] text-xs">Local Worker</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                      node.state === 'active' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                      node.state === 'idle' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' :
                      'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20'
                    }`}>{node.state}</span>
                  </td>
                  <td className="px-5 py-4 text-right text-xs">
                    <span className="text-[#58a6ff] hover:text-[#79c0ff] opacity-0 group-hover:opacity-100 transition-opacity">Inspect →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
