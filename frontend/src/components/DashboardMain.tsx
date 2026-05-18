import React, { useState, useEffect } from 'react';
import {
  Play, Activity, Server, GitCommit, FilePlus, FileEdit, FileMinus, Clock,
  ChevronDown, Settings, Save, X
} from 'lucide-react';
import { NUM_SLOTS } from '../constants';
import {
  fetchWorkerGitStatus,
  fetchWorkerSchedule,
  updateWorkerSchedule,
  fetchSchedulerStatus,
} from '../hooks/useApi';

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

interface WorkerGitStats {
  worker_id: string;
  head_commit?: string;
  added_files: number;
  modified_files: number;
  deleted_files: number;
  changed_lines: number;
  total_cpp_files: number;
  updated_at?: string;
}

interface WorkerSchedule {
  worker_id: string;
  scan_hour: number;
  scan_minute: number;
  stop_hour: number;
  stop_minute: number;
  is_enabled: boolean;
  timezone: string;
  next_scan_time?: string;
  next_stop_time?: string;
  is_running?: boolean;
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
  const localSlots = workerSlots['local'] || [];
  const localRunning = localSlots.filter((s: any) => s.status === 'running').length;
  const localStatus = localRunning > 0 ? 'running' : 'idle';

  const allWorkers: WorkerInfo[] = [
    { id: 'local', worker_id: 'local', hostname: 'localhost', ip_address: '127.0.0.1', status: localStatus },
    ...workers.filter(w => w.worker_id !== 'local'),
  ];

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('local');
  const [gitStats, setGitStats] = useState<Record<string, WorkerGitStats>>({});
  const [schedules, setSchedules] = useState<Record<string, WorkerSchedule>>({});
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkerSchedule>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);

  const selectedWorker = allWorkers.find(w => w.worker_id === selectedWorkerId) || allWorkers[0];
  const selectedGitStats = gitStats[selectedWorkerId];
  const selectedSchedule = schedules[selectedWorkerId];

  useEffect(() => {
    const load = async () => {
      if (!selectedWorkerId) return;
      try {
        const [gitData, schedData] = await Promise.all([
          fetchWorkerGitStatus(selectedWorkerId).catch(() => null),
          fetchSchedulerStatus(selectedWorkerId).catch(() => null),
        ]);
        if (gitData) {
          setGitStats(prev => ({ ...prev, [selectedWorkerId]: gitData }));
        }
        if (schedData) {
          setSchedules(prev => ({ ...prev, [selectedWorkerId]: schedData }));
        }
      } catch (err) {
        console.error('Failed to load worker stats:', err);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [selectedWorkerId]);

  const handleEditSchedule = () => {
    if (!selectedSchedule) return;
    setEditForm({
      scan_hour: selectedSchedule.scan_hour,
      scan_minute: selectedSchedule.scan_minute,
      stop_hour: selectedSchedule.stop_hour,
      stop_minute: selectedSchedule.stop_minute,
      is_enabled: selectedSchedule.is_enabled,
      timezone: selectedSchedule.timezone,
    });
    setEditingSchedule(true);
  };

  const handleSaveSchedule = async () => {
    if (!selectedWorkerId || !editForm) return;
    setSavingSchedule(true);
    try {
      const updated = await updateWorkerSchedule(selectedWorkerId, editForm);
      setSchedules(prev => ({ ...prev, [selectedWorkerId]: { ...prev[selectedWorkerId], ...updated } }));
      setEditingSchedule(false);
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setSavingSchedule(false);
    }
  };

  const formatNextScan = (iso?: string) => {
    if (!iso) return 'Not scheduled';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return 'Overdue';
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatTime = (h?: number, m?: number) => {
    if (h === undefined || m === undefined) return '--:--';
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

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
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Node-level code review: each worker manages its own git state and schedule</p>
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

          {/* Node Selector Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8b949e] uppercase font-semibold">Selected Node:</span>
            <div className="relative">
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="appearance-none bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-sm rounded-lg px-4 py-2 pr-10 font-mono focus:outline-none focus:border-[#58a6ff] cursor-pointer"
              >
                {allWorkers.map(w => (
                  <option key={w.worker_id} value={w.worker_id}>
                    {w.worker_id} ({w.hostname || 'localhost'})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none" />
            </div>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
              selectedWorker?.status === 'running'
                ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20'
                : 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20'
            }`}>
              {selectedWorker?.status}
            </span>
          </div>

          {/* Per-Worker Git Sync + Scheduler Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Git Changes Card */}
            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#e6edf3] flex items-center gap-2">
                  <GitCommit size={16} className="text-[#58a6ff]" />
                  Git Changes — {selectedWorkerId}
                </h3>
                {selectedGitStats?.head_commit && (
                  <span className="text-[10px] text-[#8b949e] font-mono">
                    HEAD: {selectedGitStats.head_commit.slice(0, 7)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[#161b22] rounded-lg p-3 text-center border border-[#30363d]">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <FilePlus size={12} className="text-[#3fb950]" />
                    <span className="text-[10px] text-[#8b949e] uppercase">Added</span>
                  </div>
                  <div className="text-lg font-bold text-[#3fb950] font-mono">{selectedGitStats?.added_files ?? '-'}</div>
                </div>
                <div className="bg-[#161b22] rounded-lg p-3 text-center border border-[#30363d]">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <FileEdit size={12} className="text-[#d29922]" />
                    <span className="text-[10px] text-[#8b949e] uppercase">Modified</span>
                  </div>
                  <div className="text-lg font-bold text-[#d29922] font-mono">{selectedGitStats?.modified_files ?? '-'}</div>
                </div>
                <div className="bg-[#161b22] rounded-lg p-3 text-center border border-[#30363d]">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <FileMinus size={12} className="text-[#f85149]" />
                    <span className="text-[10px] text-[#8b949e] uppercase">Deleted</span>
                  </div>
                  <div className="text-lg font-bold text-[#f85149] font-mono">{selectedGitStats?.deleted_files ?? '-'}</div>
                </div>
                <div className="bg-[#161b22] rounded-lg p-3 text-center border border-[#30363d]">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <GitCommit size={12} className="text-[#58a6ff]" />
                    <span className="text-[10px] text-[#8b949e] uppercase">Total C/C++</span>
                  </div>
                  <div className="text-lg font-bold text-[#58a6ff] font-mono">{selectedGitStats?.total_cpp_files ?? '-'}</div>
                </div>
              </div>
              {selectedGitStats?.updated_at && (
                <div className="mt-3 text-[10px] text-[#8b949e] text-right">
                  Last updated: {new Date(selectedGitStats.updated_at).toLocaleString()}
                </div>
              )}
            </div>

            {/* Scheduler Status Card */}
            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#e6edf3] flex items-center gap-2">
                  <Clock size={16} className="text-[#58a6ff]" />
                  Schedule — {selectedWorkerId}
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                    selectedSchedule?.is_running
                      ? 'text-[#58a6ff] bg-[#58a6ff]/10 border-[#58a6ff]/20 animate-pulse'
                      : selectedSchedule?.is_enabled
                        ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20'
                        : 'text-[#8b949e] bg-[#21262d] border-[#30363d]'
                  }`}>
                    {selectedSchedule?.is_running ? 'Scanning' : selectedSchedule?.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {!editingSchedule && (
                    <button
                      onClick={handleEditSchedule}
                      className="p-1 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-[#58a6ff] transition-colors"
                      title="Edit schedule"
                    >
                      <Settings size={14} />
                    </button>
                  )}
                </div>
              </div>

              {!editingSchedule ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Scan Time</span>
                    <span className="text-sm font-mono text-[#e6edf3]">
                      {formatTime(selectedSchedule?.scan_hour, selectedSchedule?.scan_minute)}
                      <span className="text-[#8b949e] ml-2 text-xs">
                        {selectedSchedule?.next_scan_time
                          ? `Next: ${new Date(selectedSchedule.next_scan_time).toLocaleString()} (in ${formatNextScan(selectedSchedule.next_scan_time)})`
                          : ''}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Stop Time</span>
                    <span className="text-sm font-mono text-[#e6edf3]">
                      {formatTime(selectedSchedule?.stop_hour, selectedSchedule?.stop_minute)}
                      <span className="text-[#8b949e] ml-2 text-xs">
                        {selectedSchedule?.next_stop_time
                          ? `Next: ${new Date(selectedSchedule.next_stop_time).toLocaleString()}`
                          : ''}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Timezone</span>
                    <span className="text-sm font-mono text-[#e6edf3]">{selectedSchedule?.timezone || 'Asia/Shanghai'}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Scan Time</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={editForm.scan_hour ?? 0}
                        onChange={(e) => setEditForm(prev => ({ ...prev, scan_hour: parseInt(e.target.value) || 0 }))}
                        className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      />
                      <span className="text-[#8b949e]">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={editForm.scan_minute ?? 0}
                        onChange={(e) => setEditForm(prev => ({ ...prev, scan_minute: parseInt(e.target.value) || 0 }))}
                        className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Stop Time</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={editForm.stop_hour ?? 9}
                        onChange={(e) => setEditForm(prev => ({ ...prev, stop_hour: parseInt(e.target.value) || 0 }))}
                        className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      />
                      <span className="text-[#8b949e]">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={editForm.stop_minute ?? 0}
                        onChange={(e) => setEditForm(prev => ({ ...prev, stop_minute: parseInt(e.target.value) || 0 }))}
                        className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Enabled</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.is_enabled ?? true}
                        onChange={(e) => setEditForm(prev => ({ ...prev, is_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#30363d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#238636]"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-4 py-3 border border-[#30363d]">
                    <span className="text-xs text-[#8b949e]">Timezone</span>
                    <input
                      type="text"
                      value={editForm.timezone || 'Asia/Shanghai'}
                      onChange={(e) => setEditForm(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-40 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingSchedule(false)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] rounded border border-[#30363d] hover:border-[#8b949e] transition-colors"
                    >
                      <X size={12} /> Cancel
                    </button>
                    <button
                      onClick={handleSaveSchedule}
                      disabled={savingSchedule}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white rounded transition-colors"
                    >
                      {savingSchedule ? <Activity size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                  </div>
                </div>
              )}
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
                    className={`bg-[#0d1117] border rounded-xl overflow-hidden flex flex-col shadow-sm cursor-pointer hover:border-[#58a6ff]/50 transition-all group ${
                      selectedWorkerId === node.worker_id ? 'border-[#58a6ff]' : 'border-[#30363d]'
                    }`}
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
