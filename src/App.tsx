import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Activity, CheckCircle2, ShieldCheck, Database, Cpu, Network, Globe, Server, Layers, AlertTriangle, GitPullRequest, ArrowLeft, Terminal as TerminalIcon
} from 'lucide-react';
import { AnsiUp } from 'ansi_up';

const NUM_SLOTS = 3;

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

const MOCK_NODES = [
  { id: 'node-us-east-1a', ip: '10.0.1.14', region: 'us-east', state: 'active' },
  { id: 'node-eu-west-2b', ip: '10.0.4.22', region: 'eu-west', state: 'idle' },
  { id: 'node-ap-east-1c', ip: '10.0.7.05', region: 'ap-east', state: 'offline' },
  { id: 'node-ap-east-1d', ip: '10.0.7.08', region: 'ap-east', state: 'idle' },
  { id: 'node-us-west-1a', ip: '10.0.2.11', region: 'us-west', state: 'idle' }
];

const PERSONAL_NODES = [
  { id: 'macbook-pro-m2', ip: '192.168.1.5', region: 'local', state: 'active' },
  { id: 'linux-workstation', ip: '10.0.0.24', region: 'remote-wireguard', state: 'idle' }
];

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'node' | 'fleet' | 'jobs' | 'vulnerabilities'>('dashboard');
  const [appMode, setAppMode] = useState<'enterprise' | 'personal'>('enterprise');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [slots, setSlots] = useState<SlotState[]>(
    Array.from({ length: NUM_SLOTS }, () => ({ taskId: null, filePath: null, status: 'waiting', logs: [] }))
  );
  const [activeConnections, setActiveConnections] = useState(0);
  const [uptime, setUptime] = useState(0);
  const [scanMetrics, setScanMetrics] = useState({ totalFiles: 145, sastFindings: 12, llmFindings: 3 });

  const [ansiRenderer] = useState(() => {
    const au = new AnsiUp();
    au.use_classes = false; 
    return au;
  });

  useEffect(() => {
    const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let connectedCount = 0;
    const eventSources: EventSource[] = [];

    for (let slotId = 0; slotId < NUM_SLOTS; slotId++) {
      const es = new EventSource(`/api/sse/${slotId}`);
      eventSources.push(es);

      es.onopen = () => {
        connectedCount++;
        setActiveConnections(connectedCount);
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          
          setSlots(current => {
            const newSlots = [...current];
            const slot = { ...newSlots[slotId] };

            if (msg.type === 'meta') {
              if (msg.event === 'acquire') {
                slot.taskId = msg.task_id;
                slot.filePath = msg.file_path;
                slot.status = 'running';
                slot.logs = [];
              } else if (msg.event === 'status') {
                slot.status = msg.status;
              } else if (msg.event === 'release') {
                slot.taskId = null;
                slot.filePath = null;
                slot.status = 'waiting';
                setScanMetrics(m => ({ ...m, totalFiles: m.totalFiles + 1 }));
              }
            } else {
              if (msg.content) {
                const logEntry = {
                  id: Math.random().toString(36).substr(2, 9),
                  raw: msg.content,
                  html: ansiRenderer.ansi_to_html(msg.content)
                };
                slot.logs = [...slot.logs, logEntry];

                 if (msg.content.includes('[Semgrep] Local engine matched')) {
                     setScanMetrics(m => ({ ...m, sastFindings: m.sastFindings + 1 }));
                 }
                 if (msg.content.includes('NGA Analysis:')) {
                     setScanMetrics(m => ({ ...m, llmFindings: m.llmFindings + 1 }));
                 }
              }
            }

            newSlots[slotId] = slot;
            return newSlots;
          });
        } catch (err) {}
      };
      es.onerror = () => {};
    }

    return () => {
      eventSources.forEach(es => es.close());
    };
  }, [ansiRenderer]);

  const handleStartScan = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/start_scan', { method: 'POST' });
    } catch (err) { }
    // Simulated scan completion logic
    setTimeout(() => setIsScanning(false), 8000);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setCurrentView('node');
  };

  return (
    <div className="flex h-screen bg-[#06090e] text-[#c9d1d9] font-sans overflow-hidden md:flex-row flex-col">
      {/* Sidebar */}
      <div className="w-64 bg-[#0d1117] border-r border-[#30363d] flex flex-col shrink-0 z-10 hidden md:flex">
        <div className="p-5 border-b border-[#30363d] flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1f6feb] rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
             <ShieldCheck className="text-white" size={20} />
          </div>
          <div>
            <h2 className="font-bold text-[#e6edf3] text-sm tracking-wide">OpenCode</h2>
            <div className="text-[10px] text-[#8b949e] uppercase tracking-widest font-semibold mt-0.5">Control Plane</div>
          </div>
        </div>
        
        <nav className="flex-1 py-6 flex flex-col gap-1.5 px-3">
          <button onClick={() => setCurrentView('dashboard')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'dashboard' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
            <Globe size={16} className={currentView === 'dashboard' ? 'text-[#58a6ff]' : ''} /> {appMode === 'enterprise' ? 'Global Dashboard' : 'Local Dashboard'}
          </button>
          {appMode === 'enterprise' && (
            <button onClick={() => setCurrentView('fleet')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'fleet' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
              <Server size={16} className={currentView === 'fleet' ? 'text-[#58a6ff]' : ''} /> Worker Fleet
            </button>
          )}
          <button onClick={() => setCurrentView('jobs')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'jobs' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
            <Layers size={16} className={currentView === 'jobs' ? 'text-[#58a6ff]' : ''} /> Scan Jobs Queue
          </button>
          <button onClick={() => setCurrentView('vulnerabilities')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'vulnerabilities' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
            <AlertTriangle size={16} className={currentView === 'vulnerabilities' ? 'text-[#58a6ff]' : ''} /> Vulnerability Center
          </button>
        </nav>
        
        <div className="p-5 border-t border-[#30363d]">
          <div className="mb-4 bg-[#161b22] rounded-lg p-1 flex border border-[#30363d]">
            <button onClick={() => { setAppMode('personal'); setCurrentView('dashboard'); }} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${appMode === 'personal' ? 'bg-[#21262d] text-[#e6edf3] shadow-sm' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}>Personal View</button>
            <button onClick={() => { setAppMode('enterprise'); setCurrentView('dashboard'); }} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${appMode === 'enterprise' ? 'bg-[#21262d] text-[#e6edf3] shadow-sm' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}>Fleet View</button>
          </div>
          
          {appMode === 'enterprise' && (
            <div className="bg-[#161b22] rounded-lg p-4 border border-[#30363d] shadow-sm">
               <div className="text-xs text-[#8b949e] mb-3 font-semibold uppercase tracking-wider">Fleet Utilization</div>
               <div className="flex items-end gap-2 mb-2">
                 <span className="text-2xl font-bold text-[#e6edf3]">{((activeConnections / (MOCK_NODES.length * NUM_SLOTS)) * 100).toFixed(0)}%</span>
                 <span className="text-xs text-[#8b949e] mb-1">allocated</span>
               </div>
               <div className="w-full bg-[#06090e] h-2 rounded-full overflow-hidden border border-[#30363d]">
                 <div className="bg-[#238636] h-full w-[20%] transition-all duration-1000"></div>
               </div>
            </div>
          )}
        </div>
      </div>
  
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#06090e]">
        {currentView === 'vulnerabilities' ? (
          <VulnerabilityCenter />
        ) : currentView === 'dashboard' ? (
          appMode === 'enterprise' ? (
            <DashboardMain 
              isScanning={isScanning} 
              handleStartScan={handleStartScan} 
              scanMetrics={scanMetrics} 
              activeConnections={activeConnections} 
              onNodeClick={handleNodeClick}
              slots={slots}
            />
          ) : (
            <PersonalDashboard
              isScanning={isScanning} 
              handleStartScan={handleStartScan} 
              scanMetrics={scanMetrics}
              slots={slots}
              onNodeClick={handleNodeClick}
            />
          )
        ) : currentView === 'node' ? (
          <NodeDetail 
            nodeId={selectedNodeId!} 
            onBack={() => { setCurrentView('dashboard'); setSelectedNodeId(null); }}
            slots={selectedNodeId === 'node-us-east-1a' || selectedNodeId === 'macbook-pro-m2' ? slots : Array.from({ length: 3 }, () => ({ taskId: null, filePath: null, status: 'waiting', logs: [] }))} 
          />
        ) : currentView === 'fleet' ? (
          <WorkerFleet activeConnections={activeConnections} onNodeClick={handleNodeClick} />
        ) : currentView === 'jobs' ? (
          <ScanJobsQueue isScanning={isScanning} slots={slots} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#8b949e] flex-col gap-4">
             <ShieldCheck size={48} className="opacity-30" />
             <div className="text-center">
                <h2 className="text-xl font-semibold mb-2 text-[#e6edf3]">Module Under Construction</h2>
                <p className="text-sm">The '{currentView}' view is being developed in a future iteration.</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: DashboardMain (Global Fleet Overview)
// -----------------------------------------------------------------------------
function DashboardMain({ isScanning, handleStartScan, scanMetrics, activeConnections, onNodeClick, slots }: any) {
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
                <Server size={18} className="text-[#8b949e]" /> Registered Worker Fleet
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {MOCK_NODES.map((node) => {
                // Determine mock load based on state
                let load = '0%';
                let isPulse = false;
                if (node.state === 'active') {
                   // Active meaning it's executing tasks (e.g., our real streaming one)
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
                          <div className={`w-2.5 h-2.5 rounded-full ${node.state === 'active' ? 'bg-[#3fb950] ' + (isPulse ? 'animate-pulse' : '') : node.state === 'idle' ? 'bg-[#d29922]' : 'bg-[#484f58]'}`}></div>
                          <span className="font-mono text-[13px] font-bold text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">{node.id}</span>
                        </div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          node.state === 'active' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' : 
                          node.state === 'idle' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' : 
                          'text-[#8b949e] bg-[#21262d] border-[#30363d]'
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
    </>
  );
}


// -----------------------------------------------------------------------------
// Component: NodeDetail (Single Node NGA Dashboard)
// -----------------------------------------------------------------------------
function NodeDetail({ nodeId, onBack, slots }: any) {
  const terminalRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    slots.forEach((_: any, i: number) => {
      const node = terminalRefs.current[i];
      if (node) {
         node.scrollTop = node.scrollHeight;
      }
    });
  }, [slots]);

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
              <div className="flex items-center text-xs">
                {slot.filePath && (
                  <span className="bg-[#21262d] px-2 py-1 rounded text-[#e6edf3] truncate border border-[#30363d] max-w-[150px] text-right" title={slot.filePath}>
                    {slot.taskId && <span className="text-[#8b949e] mr-1">[{slot.taskId}]</span>}
                    {slot.filePath.split('/').pop()}
                  </span>
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

// -----------------------------------------------------------------------------
// Component: VulnerabilityCenter (Displays PostgreSQL synced findings)
// -----------------------------------------------------------------------------
const MOCK_VULNERABILITIES = [
  { id: 'VULN-8091', file: 'src/auth/session.cpp', type: 'SAST (Semgrep)', severity: 'High', message: 'Use of hardcoded cryptographic key', timestamp: '2 mins ago', status: 'Open' },
  { id: 'VULN-8090', file: 'api/handlers/user.go', type: 'SAST (CodeQL)', severity: 'Medium', message: 'Potential SQL Injection via unescaped input', timestamp: '15 mins ago', status: 'In Review' },
  { id: 'VULN-8089', file: 'services/payment/stripe.ts', type: 'NGA (Semantic)', severity: 'Critical', message: 'LLM matched: Business logic flaw - checkout amount can be manipulated before final confirmation', timestamp: '1 hour ago', status: 'Open' },
  { id: 'VULN-8088', file: 'lib/utils/parsers.py', type: 'SAST (Semgrep)', severity: 'Low', message: 'Unhandled exception in XML parser could lead to DoS', timestamp: '3 hours ago', status: 'Fixed' },
  { id: 'VULN-8087', file: 'frontend/src/components/Upload.tsx', type: 'NGA (Semantic)', severity: 'Medium', message: 'LLM matched: Cross-site scripting (XSS) vulnerability in user-provided SVG rendering', timestamp: '5 hours ago', status: 'Open' },
];

function VulnerabilityCenter() {
  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
             Vulnerability Center
             <span className="text-[10px] font-bold uppercase tracking-wider bg-[#21262d] border border-[#30363d] px-2.5 py-0.5 rounded-full text-[#8b949e] flex items-center gap-1.5 shadow-sm">
               <Database size={10} className="text-[#58a6ff]" /> PostgreSQL Synced
             </span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Centralized view of all SAST and semantic LLM findings across all repos</p>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden flex flex-col h-full max-h-[800px]">
          <div className="px-5 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#e6edf3]">Latest Scan Findings</h2>
            <div className="flex items-center gap-2">
              <span className="bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[#3fb950]" /> Active
              </span>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap lg:whitespace-normal">
              <thead className="bg-[#0d1117] text-[#8b949e] text-[11px] font-bold uppercase tracking-wider border-b border-[#30363d] sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Target File</th>
                  <th className="px-5 py-3 w-1/3">Issue Description</th>
                  <th className="px-5 py-3">Analyzer Source</th>
                  <th className="px-5 py-3 text-right">Age</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {MOCK_VULNERABILITIES.map((vuln) => (
                  <tr key={vuln.id} className="hover:bg-[#161b22] transition-colors group cursor-pointer group">
                    <td className="px-5 py-4 font-mono text-[#58a6ff] text-xs group-hover:underline">{vuln.id}</td>
                    <td className="px-5 py-4 text-xs font-semibold">
                      <span className={`px-2 py-0.5 rounded border ${
                        vuln.severity === 'Critical' ? 'bg-[#f85149]/10 text-[#f85149] border-[#f85149]/20' :
                        vuln.severity === 'High' ? 'bg-[#f85149]/10 text-[#f85149] border-[#f85149]/20' :
                        vuln.severity === 'Medium' ? 'bg-[#d29922]/10 text-[#d29922] border-[#d29922]/20' :
                        'bg-[#8b949e]/10 text-[#8b949e] border-[#30363d]'
                      }`}>
                        {vuln.severity}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-[#c9d1d9] text-xs truncate max-w-[200px]" title={vuln.file}>{vuln.file}</td>
                    <td className="px-5 py-4 text-[#e6edf3] text-[13px] leading-tight">
                      {vuln.message.startsWith('LLM matched: ') ? (
                        <>
                          <span className="text-[#a371f7] font-semibold">LLM Analysis:</span> {vuln.message.replace('LLM matched: ', '')}
                        </>
                      ) : (
                        vuln.message
                      )}
                    </td>
                    <td className="px-5 py-4 text-[#8b949e] text-xs font-medium">{vuln.type}</td>
                    <td className="px-5 py-4 text-[#8b949e] text-xs text-right whitespace-nowrap">{vuln.timestamp}</td>
                    <td className="px-5 py-4 text-center">
                       <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded inline-block w-full max-w-[80px] ${
                         vuln.status === 'Open' ? 'text-[#f85149]' :
                         vuln.status === 'Fixed' ? 'text-[#3fb950]' :
                         'text-[#d29922]'
                       }`}>
                         {vuln.status}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
function PersonalDashboard({ isScanning, handleStartScan, scanMetrics, slots, onNodeClick }: any) {
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

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="p-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col gap-6">
          
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PERSONAL_NODES.map((node) => {
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

// -----------------------------------------------------------------------------
// Component: WorkerFleet (Fleet health and detailed stats)
// -----------------------------------------------------------------------------
function WorkerFleet({ activeConnections, onNodeClick }: any) {
  const allNodes = [...MOCK_NODES, ...PERSONAL_NODES];

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
                  <td className="px-5 py-4 text-[#8b949e] text-xs">{PERSONAL_NODES.some(m => m.id === node.id) ? 'Personal/Local' : 'Enterprise / K8s'}</td>
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

// -----------------------------------------------------------------------------
// Component: ScanJobsQueue (List of enqueued and currently executing jobs)
// -----------------------------------------------------------------------------
const MOCK_JOBS = [
  { id: 'job-9f8a84', repo: 'backend-auth-service', branch: 'main', commit: 'a1b2c3d', status: 'Running', time: 'Started 2m ago', type: 'Full Analysis' },
  { id: 'job-3c4d5e', repo: 'payment-gateway', branch: 'feat/stripe-int', commit: 'e5f6g7h', status: 'Queued', time: 'Queued 5m ago', type: 'SAST Only' },
  { id: 'job-1a2b3c', repo: 'frontend-dashboard', branch: 'fix/login-bug', commit: 'i9j0k1l', status: 'Completed', time: 'Finished 1h ago', type: 'Full Analysis' },
  { id: 'job-7b8c9d', repo: 'user-profile-api', branch: 'main', commit: 'm2n3o4p', status: 'Failed', time: 'Failed 3h ago', type: 'Semantic Check' },
];

function ScanJobsQueue({ isScanning, slots }: any) {
  // If scanning, show a pseudo job
  const activeJobs = isScanning ? [{ id: 'job-current', repo: 'current-workspace', branch: 'local', commit: 'HEAD', status: 'Running', time: 'Started just now', type: 'Interactive Analysis' }] : [];
  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
             <Layers className="text-[#8b949e]" /> Scan Jobs Queue
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">View currently executing tasks and historical analysis job queue</p>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0d1117] text-[#8b949e] text-[11px] font-bold uppercase tracking-wider border-b border-[#30363d]">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">Repository</th>
                <th className="px-5 py-3">Branch / Commit</th>
                <th className="px-5 py-3">Job Type</th>
                <th className="px-5 py-3 text-right">Timing</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {[...activeJobs, ...MOCK_JOBS].map((job) => (
                <tr key={job.id} className="hover:bg-[#161b22] transition-colors group cursor-pointer">
                  <td className="px-5 py-4 font-mono text-[#58a6ff] text-xs">
                    {job.id}
                  </td>
                  <td className="px-5 py-4 text-[#e6edf3] text-[13px] font-medium">{job.repo}</td>
                  <td className="px-5 py-4 font-mono text-xs text-[#8b949e]">
                    <span className="text-[#e6edf3] bg-[#21262d] px-1.5 py-0.5 rounded mr-2">{job.branch}</span>
                    {job.commit}
                  </td>
                  <td className="px-5 py-4 text-[#c9d1d9] text-xs">{job.type}</td>
                  <td className="px-5 py-4 text-[#8b949e] text-xs text-right whitespace-nowrap">{job.time}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                      job.status === 'Running' ? 'text-[#58a6ff] bg-[#58a6ff]/10 border-[#58a6ff]/20 animate-pulse' : 
                      job.status === 'Completed' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                      job.status === 'Queued' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' :
                      'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20'
                    }`}>{job.status}</span>
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