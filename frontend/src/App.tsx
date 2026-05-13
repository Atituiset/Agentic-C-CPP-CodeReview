import React, { useState, useEffect } from 'react';
import {
  Activity, ShieldCheck, Database, Server, Network, Globe, Layers, AlertTriangle
} from 'lucide-react';
import { AnsiUp } from 'ansi_up';
import { fetchJobs, createJob } from './hooks/useApi';
import ReportViewer from './components/ReportViewer';
import DashboardMain from './components/DashboardMain';
import NodeDetail from './components/NodeDetail';
import VulnerabilityCenter from './components/VulnerabilityCenter';
import PersonalDashboard from './components/PersonalDashboard';
import WorkerFleet from './components/WorkerFleet';
import ScanJobsQueue from './components/ScanJobsQueue';
import { NUM_SLOTS } from './constants';

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

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
  const [scanMetrics, setScanMetrics] = useState({ totalFiles: 0, sastFindings: 0, llmFindings: 0 });
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
                slot.logs = [];
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

  // Fetch jobs on mount and poll every 3s
  useEffect(() => {
    const load = () => {
      setJobsLoading(true);
      fetchJobs()
        .then(data => setJobs(data))
        .catch(err => console.error('Failed to load jobs:', err))
        .finally(() => setJobsLoading(false));
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartScan = async () => {
    setIsScanning(true);
    try {
      await createJob({
        repo_path: '.',
        mode: 'files',
        file_paths: [
          'src/wireless/timer_manager.c',
          'src/memory_pool.cpp',
          'src/mac/scheduler.c',
          'src/network/tcp_handler.c',
          'src/crypto/aes_gcm.c',
          'src/drivers/spi_controller.c',
          'src/utils/ring_buffer.c',
          'src/protocol/http_parser.c',
          'src/security/auth_manager.c',
          'src/utils/logger.c',
        ],
      });
      // Refresh jobs list
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err) {
      console.error('Failed to start scan:', err);
    }
    setTimeout(() => setIsScanning(false), 2000);
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
                 <span className="text-2xl font-bold text-[#e6edf3]">{((activeConnections / NUM_SLOTS) * 100).toFixed(0)}%</span>
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
            slots={slots}
          />
        ) : currentView === 'fleet' ? (
          <WorkerFleet activeConnections={activeConnections} onNodeClick={handleNodeClick} />
        ) : currentView === 'jobs' ? (
          <ScanJobsQueue isScanning={isScanning} jobs={jobs} jobsLoading={jobsLoading} onViewReports={setSelectedJobId} setCurrentView={setCurrentView} />
        ) : currentView === 'report' ? (
          <ReportViewer jobId={selectedJobId!} onBack={() => { setCurrentView('jobs'); setSelectedJobId(null); }} />
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
