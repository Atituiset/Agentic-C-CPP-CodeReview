import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, ShieldCheck, Database, Server, Network, Globe, Layers, AlertTriangle, Users, LogOut
} from 'lucide-react';
import { AnsiUp } from 'ansi_up';
import { fetchJobs, createJob, fetchWorkers, updateWorkerShowThinking } from './hooks/useApi';
import { useAuth } from './context/AuthContext';
import ReportViewer from './components/ReportViewer';
import DashboardMain from './components/DashboardMain';
import NodeDetail from './components/NodeDetail';
import VulnerabilityCenter from './components/VulnerabilityCenter';
import PersonalDashboard from './components/PersonalDashboard';
import WorkerFleet from './components/WorkerFleet';
import ScanJobsQueue from './components/ScanJobsQueue';
import MemoryManager from './components/MemoryManager';
import UserManager from './components/UserManager';
import MyWorkers from './components/MyWorkers';
import LoginPage from './components/LoginPage';
import { NUM_SLOTS } from './constants';

interface SlotState {
  taskId: string | null;
  filePath: string | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  logs: { id: string; html: string; raw: string }[];
}

function createEmptySlots(): SlotState[] {
  return Array.from({ length: NUM_SLOTS }, () => ({ taskId: null, filePath: null, status: 'waiting', logs: [] }));
}

interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
  show_thinking: boolean;
}

function AppContent({
  user,
  updateShowThinking,
  logout,
}: {
  user: User;
  updateShowThinking: (show: boolean) => Promise<void>;
  logout: () => void;
}) {
  const isAdmin = user.role === 'admin';
  const [currentView, setCurrentView] = useState<'dashboard' | 'node' | 'fleet' | 'jobs' | 'vulnerabilities' | 'memory' | 'users' | 'my-workers'>('dashboard');
  const [appMode, setAppMode] = useState<'enterprise' | 'personal'>(isAdmin ? 'enterprise' : 'personal');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [workerSlots, setWorkerSlots] = useState<Record<string, SlotState[]>>({});
  const [workers, setWorkers] = useState<any[]>([]);
  const [activeConnections, setActiveConnections] = useState(0);
  const [uptime, setUptime] = useState(0);
  const [scanMetrics, setScanMetrics] = useState({ totalFiles: 0, sastFindings: 0, llmFindings: 0 });
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const workerEventSources = useRef<Record<string, EventSource[]>>({});

  const [ansiRenderer] = useState(() => {
    const au = new AnsiUp();
    au.use_classes = false;
    return au;
  });

  useEffect(() => {
    const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const allWorkers = workers;

  const shouldShowThinking = (workerId: string) => {
    if (!user?.show_thinking) return false;
    const w = allWorkers.find((w: any) => w.worker_id === workerId);
    if (w && w.show_thinking === false) return false;
    return true;
  };

  const isThinkingLog = (content: string) => {
    return content.includes('Thinking:') || content.includes('Thinking ');
  };

  const connectWorkerSSE = (workerId: string, urlPrefix: string) => {
    if (workerEventSources.current[workerId]) return;

    const sources: EventSource[] = [];
    let connectedCount = 0;

    for (let slotId = 0; slotId < NUM_SLOTS; slotId++) {
      const es = new EventSource(`${urlPrefix}/${slotId}`);
      sources.push(es);

      es.onopen = () => {
        connectedCount++;
        setActiveConnections(prev => prev + 1);
      };

      es.onmessage = (e) => {
        console.log('[SSE MSG]', workerId, slotId, e.data);
        try {
          const msg = JSON.parse(e.data);

          setWorkerSlots(current => {
            const newMap = { ...current };
            const slots = [...(newMap[workerId] || createEmptySlots())];
            const slot = { ...slots[slotId] };

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
                const thinking = isThinkingLog(msg.content);
                if (thinking && !shouldShowThinking(workerId)) {
                  // Skip thinking log
                } else {
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
            }

            slots[slotId] = slot;
            newMap[workerId] = slots;
            return newMap;
          });
        } catch (err) {}
      };

      es.onerror = () => {};
    }

    workerEventSources.current[workerId] = sources;
  };

  const disconnectWorkerSSE = (workerId: string) => {
    const sources = workerEventSources.current[workerId];
    if (!sources) return;
    sources.forEach(es => es.close());
    delete workerEventSources.current[workerId];
    setActiveConnections(prev => Math.max(0, prev - NUM_SLOTS));
  };

  useEffect(() => {
    const loadWorkers = () => {
      fetchWorkers()
        .then(data => {
          setWorkers(data);
          setWorkerSlots(current => {
            const newMap = { ...current };
            data.forEach((w: any) => {
              if (!newMap[w.worker_id]) {
                newMap[w.worker_id] = createEmptySlots();
              }
            });
            return newMap;
          });
          data.forEach((w: any) => {
            const sseBase = import.meta.env.DEV ? 'http://localhost:3000' : '';
            connectWorkerSSE(w.worker_id, `${sseBase}/api/sse/${w.worker_id}`);
          });
          Object.keys(workerEventSources.current).forEach(id => {
            if (!data.find((w: any) => w.worker_id === id)) {
              disconnectWorkerSSE(id);
            }
          });
        })
        .catch(err => console.error('Failed to load workers:', err));
    };

    loadWorkers();
    const interval = setInterval(loadWorkers, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ansiRenderer]);

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
          'wireless/timer_manager.c',
          'memory_pool.cpp',
          'mac/scheduler.c',
          'network/tcp_handler.c',
          'crypto/aes_gcm.c',
          'drivers/spi_controller.c',
          'utils/ring_buffer.c',
          'protocol/http_parser.c',
          'security/auth_manager.c',
          'utils/logger.c',
        ],
      });
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
            <Globe size={16} className={currentView === 'dashboard' ? 'text-[#58a6ff]' : ''} /> {isAdmin && appMode === 'enterprise' ? 'Global Dashboard' : 'Local Dashboard'}
          </button>
          {isAdmin && appMode === 'enterprise' && (
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
          <button onClick={() => setCurrentView('memory')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'memory' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
            <Database size={16} className={currentView === 'memory' ? 'text-[#58a6ff]' : ''} /> Memory Manager
          </button>
          {appMode === 'personal' && (
            <button onClick={() => setCurrentView('my-workers')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'my-workers' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
              <Server size={16} className={currentView === 'my-workers' ? 'text-[#58a6ff]' : ''} /> My Workers
            </button>
          )}
          {isAdmin && appMode === 'enterprise' && (
            <button onClick={() => setCurrentView('users')} className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer w-full text-left ${currentView === 'users' ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm' : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
              <Users size={16} className={currentView === 'users' ? 'text-[#58a6ff]' : ''} /> User Management
            </button>
          )}
        </nav>

        <div className="p-5 border-t border-[#30363d]">
          <div className="mb-4 flex items-center gap-3 px-3 py-2 bg-[#161b22] rounded-lg border border-[#30363d]">
            <div className="w-7 h-7 rounded-full bg-[#1f6feb] flex items-center justify-center text-white text-xs font-bold">
              {user?.display_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#e6edf3] font-medium truncate">{user?.display_name || user?.username || 'Unknown'}</div>
              <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">{user?.role || 'user'}</div>
            </div>
            <button
              onClick={() => logout()}
              className="text-[#8b949e] hover:text-[#f85149] transition-colors p-1 rounded hover:bg-[#30363d]/50"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>

          {/* Personal Thinking Toggle */}
          <div className="mb-4 flex items-center justify-between px-3 py-2 bg-[#161b22] rounded-lg border border-[#30363d]">
            <span className="text-xs text-[#8b949e]">Show Thinking</span>
            <button
              onClick={() => user && updateShowThinking && updateShowThinking(!user.show_thinking)}
              className={`relative w-9 h-5 rounded-full transition-colors ${user?.show_thinking ? 'bg-[#238636]' : 'bg-[#30363d]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${user?.show_thinking ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {isAdmin && (
            <div className="mb-4 bg-[#161b22] rounded-lg p-1 flex border border-[#30363d]">
              <button onClick={() => { setAppMode('personal'); setCurrentView('dashboard'); }} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${appMode === 'personal' ? 'bg-[#21262d] text-[#e6edf3] shadow-sm' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}>Personal View</button>
              <button onClick={() => { setAppMode('enterprise'); setCurrentView('dashboard'); }} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${appMode === 'enterprise' ? 'bg-[#21262d] text-[#e6edf3] shadow-sm' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}>Fleet View</button>
            </div>
          )}

          {isAdmin && appMode === 'enterprise' && (
            <div className="bg-[#161b22] rounded-lg p-4 border border-[#30363d] shadow-sm">
               <div className="text-xs text-[#8b949e] mb-3 font-semibold uppercase tracking-wider">Fleet Utilization</div>
               <div className="flex items-end gap-2 mb-2">
                 <span className="text-2xl font-bold text-[#e6edf3]">{((activeConnections / (Math.max(1, Object.keys(workerSlots).length) * NUM_SLOTS)) * 100).toFixed(0)}%</span>
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
      <div className="flex-1 flex flex-col min-w-0 bg-[#06090e] overflow-hidden">
        {currentView === 'vulnerabilities' ? (
          <VulnerabilityCenter workers={workers} jobs={jobs} />
        ) : currentView === 'dashboard' ? (
          appMode === 'enterprise' ? (
            <DashboardMain
              isScanning={isScanning}
              handleStartScan={handleStartScan}
              scanMetrics={scanMetrics}
              activeConnections={activeConnections}
              onNodeClick={handleNodeClick}
              workers={workers}
              workerSlots={workerSlots}
            />
          ) : (
            <PersonalDashboard
              isScanning={isScanning}
              handleStartScan={handleStartScan}
              scanMetrics={scanMetrics}
              workers={allWorkers}
              workerSlots={workerSlots}
              onNodeClick={handleNodeClick}
              onUpdateWorkerShowThinking={async (workerId, show) => {
                try {
                  await updateWorkerShowThinking(workerId, show);
                  setWorkers(current => current.map(w => w.worker_id === workerId ? { ...w, show_thinking: show } : w));
                } catch (err) {
                  console.error('Failed to update worker thinking setting:', err);
                }
              }}
            />
          )
        ) : currentView === 'node' ? (
          <NodeDetail
            nodeId={selectedNodeId!}
            onBack={() => { setCurrentView('dashboard'); setSelectedNodeId(null); }}
            workerSlots={workerSlots}
          />
        ) : currentView === 'fleet' ? (
          <WorkerFleet activeConnections={activeConnections} onNodeClick={handleNodeClick} workers={allWorkers} workerSlots={workerSlots} onUpdateWorkerShowThinking={async (workerId, show) => {
            try {
              await updateWorkerShowThinking(workerId, show);
              setWorkers(current => current.map(w => w.worker_id === workerId ? { ...w, show_thinking: show } : w));
            } catch (err) {
              console.error('Failed to update worker thinking setting:', err);
            }
          }} />
        ) : currentView === 'jobs' ? (
          <ScanJobsQueue isScanning={isScanning} jobs={jobs} jobsLoading={jobsLoading} onViewReports={setSelectedJobId} setCurrentView={setCurrentView} workers={workers} />
        ) : currentView === 'memory' ? (
          <MemoryManager />
        ) : currentView === 'users' ? (
          <UserManager />
        ) : currentView === 'my-workers' ? (
          <MyWorkers />
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

export default function App() {
  const { user, isLoading: authLoading, updateShowThinking, logout } = useAuth();

  if (authLoading) {
    return (
      <div className="flex h-screen bg-[#06090e] text-[#c9d1d9] font-sans items-center justify-center">
        <div className="text-center">
          <Activity className="animate-spin mx-auto mb-4 text-[#1f6feb]" size={32} />
          <p className="text-sm text-[#8b949e]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppContent
      user={user}
      updateShowThinking={updateShowThinking}
      logout={logout}
    />
  );
}
