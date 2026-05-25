import React, { useState, useEffect, useCallback } from 'react';
import { Server, Plus, RefreshCw, Trash2, Play } from 'lucide-react';
import { fetchWorkers, deployWorker, deleteWorker } from '../hooks/useApi';
import AddWorkerModal from './AddWorkerModal';

interface Worker {
  worker_id: string;
  status: string;
  deploy_status?: string;
  ip_address?: string;
  repo_path?: string;
  scan_mode?: string;
  last_heartbeat?: string;
}

export default function MyWorkers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkers();
      setWorkers(data.filter((w: Worker) => w.worker_id !== 'local'));
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const handleDeploy = async (workerId: string) => {
    setDeployingId(workerId);
    try {
      await deployWorker(workerId);
      await loadWorkers();
    } catch (err) {
      console.error('Failed to deploy worker:', err);
    } finally {
      setDeployingId(null);
    }
  };

  const handleDelete = async (workerId: string) => {
    if (!confirm(`Are you sure you want to delete worker "${workerId}"?`)) return;
    setDeletingId(workerId);
    try {
      await deleteWorker(workerId);
      await loadWorkers();
    } catch (err) {
      console.error('Failed to delete worker:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case 'active':
      case 'running':
        return 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20';
      case 'idle':
        return 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20';
      case 'deployed':
        return 'text-[#58a6ff] bg-[#58a6ff]/10 border-[#58a6ff]/20';
      case 'error':
      case 'failed':
        return 'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20';
      default:
        return 'text-[#8b949e] bg-[#8b949e]/10 border-[#8b949e]/20';
    }
  };

  const deployStatusColor = (status?: string) => {
    switch (status) {
      case 'deployed':
        return 'text-[#3fb950]';
      case 'pending':
        return 'text-[#d29922]';
      case 'failed':
        return 'text-[#f85149]';
      default:
        return 'text-[#8b949e]';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
            <Server className="text-[#8b949e]" /> My Workers
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">
            Manage your remote worker nodes for distributed code scanning
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadWorkers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#238636] hover:bg-[#2ea043] text-white transition-colors shadow-md"
          >
            <Plus size={14} />
            Add Worker
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        {workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[#8b949e] py-24">
            <Server size={48} className="opacity-30 mb-4" />
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">No Workers Yet</h3>
            <p className="text-sm mb-6">Add your first remote worker to start distributed scanning.</p>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#238636] hover:bg-[#2ea043] text-white transition-colors shadow-md"
            >
              <Plus size={14} />
              Add Worker
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {workers.map((worker) => (
              <div
                key={worker.worker_id}
                className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden flex flex-col shadow-sm hover:border-[#30363d]/80 transition-colors"
              >
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${worker.status === 'running' || worker.status === 'active' ? 'bg-[#3fb950]' : worker.status === 'idle' ? 'bg-[#d29922]' : 'bg-[#f85149]'}`} />
                      <span className="font-mono text-[13px] font-bold text-[#e6edf3]">
                        {worker.worker_id}
                      </span>
                    </div>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusColor(worker.status)}`}>
                      {worker.status || 'unknown'}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#8b949e]">Deploy Status</span>
                      <span className={`font-medium ${deployStatusColor(worker.deploy_status)}`}>
                        {worker.deploy_status || 'not deployed'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b949e]">IP Address</span>
                      <span className="text-[#c9d1d9] font-mono">{worker.ip_address || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b949e]">Repository</span>
                      <span className="text-[#c9d1d9] font-mono truncate max-w-[180px]">{worker.repo_path || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b949e]">Scan Mode</span>
                      <span className="text-[#c9d1d9]">{worker.scan_mode || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b949e]">Last Heartbeat</span>
                      <span className="text-[#c9d1d9]">
                        {worker.last_heartbeat
                          ? new Date(worker.last_heartbeat).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-[#30363d] flex items-center justify-end gap-2 bg-[#0d1117]">
                  {worker.deploy_status !== 'deployed' && (
                    <button
                      onClick={() => handleDeploy(worker.worker_id)}
                      disabled={deployingId === worker.worker_id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1f6feb] hover:bg-[#388bfd] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      <Play size={12} />
                      {deployingId === worker.worker_id ? 'Deploying...' : 'Deploy'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(worker.worker_id)}
                    disabled={deletingId === worker.worker_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#f85149]/30 text-[#f85149] hover:bg-[#f85149]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={12} />
                    {deletingId === worker.worker_id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddWorkerModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadWorkers();
          }}
        />
      )}
    </div>
  );
}
