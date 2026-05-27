import React, { useState, useEffect, useCallback } from 'react';
import { Server, Plus, RefreshCw, Trash2, Play, Copy, Check, Key, FileText, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchWorkers, deployWorker, deleteWorker, fetchDeployKey, fetchWorkerDeployLogs, updateWorker } from '../hooks/useApi';
import AddWorkerModal from './AddWorkerModal';

interface Worker {
  worker_id: string;
  status: string;
  deploy_status?: string;
  deploy_error?: string;
  ip_address?: string;
  repo_path?: string;
  scan_mode?: string;
  last_heartbeat?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
}

export default function MyWorkers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [showLogsId, setShowLogsId] = useState<string | null>(null);
  const [logsData, setLogsData] = useState<Record<string, any>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkers();
      setWorkers(data);
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeployKey()
      .then(data => setPublicKey(data.public_key))
      .catch(err => console.error('Failed to load deploy key:', err));
  }, []);

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(deployCommand);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const deployCommand = publicKey
    ? `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
    : '';

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(deployCommand);
      setCmdCopied(true);
      setTimeout(() => setCmdCopied(false), 2000);
    } catch {
      // ignore
    }
  };

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

  const handleViewLogs = async (workerId: string) => {
    if (showLogsId === workerId) {
      setShowLogsId(null);
      return;
    }
    setShowLogsId(workerId);
    if (!logsData[workerId]) {
      setLogsLoading(workerId);
      try {
        const data = await fetchWorkerDeployLogs(workerId);
        setLogsData(prev => ({ ...prev, [workerId]: data }));
      } catch (err) {
        console.error('Failed to load deploy logs:', err);
      } finally {
        setLogsLoading(null);
      }
    }
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent, workerId: string, form: any) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const payload: any = {};
      if (form.ssh_host !== undefined) payload.ssh_host = form.ssh_host || undefined;
      if (form.ssh_port !== undefined) payload.ssh_port = form.ssh_port || undefined;
      if (form.ssh_username !== undefined) payload.ssh_username = form.ssh_username || undefined;
      if (form.ssh_password !== undefined) payload.ssh_password = form.ssh_password || undefined;
      if (form.repo_path !== undefined) payload.repo_path = form.repo_path || undefined;
      if (form.scan_mode !== undefined) payload.scan_mode = form.scan_mode;
      if (form.cared_paths !== undefined) {
        payload.cared_paths = form.cared_paths
          ? form.cared_paths.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;
      }
      await updateWorker(workerId, payload);
      setShowEditModal(false);
      setEditingWorker(null);
      await loadWorkers();
    } catch (err) {
      console.error('Failed to update worker:', err);
      alert('Failed to update worker');
    } finally {
      setSavingEdit(false);
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
            onClick={handleCopyKey}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors"
            title="Copy deploy public key"
          >
            {keyCopied ? <Check size={14} className="text-[#3fb950]" /> : <Key size={14} />}
            {keyCopied ? 'Copied' : 'Copy Deploy Key'}
          </button>
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
        {/* Deploy Public Key Card */}
        {publicKey && (
          <div className="mb-6 bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[#58a6ff] uppercase tracking-wider flex items-center gap-2">
                <Key size={14} /> Deploy Public Key
              </h3>
              <button
                onClick={handleCopyKey}
                className="flex items-center gap-1 text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                {keyCopied ? <Check size={12} className="text-[#3fb950]" /> : <Copy size={12} />}
                {keyCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-[#8b949e] mb-2">
              Run this command on your worker to authorize the deploy key:
            </p>
            <div className="relative">
              <div className="bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-[11px] text-[#c9d1d9] font-mono break-all">
                {deployCommand}
              </div>
              <button
                onClick={handleCopyCommand}
                className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] transition-colors border border-[#30363d]"
              >
                {cmdCopied ? <Check size={10} className="text-[#3fb950]" /> : <Copy size={10} />}
                {cmdCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

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

                  {worker.deploy_status === 'failed' && worker.deploy_error && (
                    <div className="mt-3 bg-[#f85149]/5 border border-[#f85149]/20 rounded-lg p-2.5">
                      <p className="text-[10px] text-[#f85149] font-medium mb-1">Deployment Failed</p>
                      <p className="text-[10px] text-[#f85149]/80 font-mono break-all">{worker.deploy_error}</p>
                    </div>
                  )}

                  {showLogsId === worker.worker_id && (
                    <div className="mt-3 bg-[#010409] border border-[#30363d] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-[#58a6ff] uppercase tracking-wider">Deploy Logs</span>
                        <button onClick={() => setShowLogsId(null)} className="text-[#8b949e] hover:text-[#e6edf3]">
                          <X size={12} />
                        </button>
                      </div>
                      {logsLoading === worker.worker_id ? (
                        <p className="text-[10px] text-[#8b949e]">Loading...</p>
                      ) : logsData[worker.worker_id]?.logs?.length > 0 ? (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {logsData[worker.worker_id].logs.map((log: any, i: number) => (
                            <div key={i} className="text-[10px] font-mono">
                              <span className="text-[#8b949e]">[{log.step}]</span>{' '}
                              <span className={log.step === 'error' ? 'text-[#f85149]' : 'text-[#c9d1d9]'}>{log.msg}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#8b949e]">No logs available</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-[#30363d] flex items-center justify-end gap-2 bg-[#0d1117] flex-wrap">
                  <button
                    onClick={() => handleViewLogs(worker.worker_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors"
                  >
                    <FileText size={12} />
                    {showLogsId === worker.worker_id ? 'Hide Logs' : 'Logs'}
                  </button>
                  <button
                    onClick={() => handleEdit(worker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
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

      {showEditModal && editingWorker && (
        <EditWorkerModal
          worker={editingWorker}
          onClose={() => { setShowEditModal(false); setEditingWorker(null); }}
          onSave={handleSaveEdit}
          saving={savingEdit}
        />
      )}
    </div>
  );
}

function EditWorkerModal({ worker, onClose, onSave, saving }: {
  worker: Worker;
  onClose: () => void;
  onSave: (e: React.FormEvent, workerId: string, form: any) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    ssh_host: worker.ssh_host || '',
    ssh_port: worker.ssh_port || 22,
    ssh_username: worker.ssh_username || '',
    ssh_password: '',
    repo_path: worker.repo_path || '',
    scan_mode: worker.scan_mode || 'full',
    cared_paths: '',
  });

  const handleChange = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#e6edf3]">Edit Worker: {worker.worker_id}</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#f85149] transition-colors p-1 rounded hover:bg-[#30363d]/50">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => onSave(e, worker.worker_id, form)} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">SSH Host</label>
              <input type="text" value={form.ssh_host} onChange={e => handleChange('ssh_host', e.target.value)} placeholder="e.g. 192.168.1.100"
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">SSH Port</label>
              <input type="number" value={form.ssh_port} onChange={e => handleChange('ssh_port', parseInt(e.target.value) || 0)}
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">SSH Username</label>
            <input type="text" value={form.ssh_username} onChange={e => handleChange('ssh_username', e.target.value)} placeholder="e.g. ubuntu"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">SSH Password <span className="text-[#8b949e] font-normal normal-case">(optional, leave empty to keep current)</span></label>
            <input type="password" value={form.ssh_password} onChange={e => handleChange('ssh_password', e.target.value)} placeholder="Leave empty to use deploy key"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Repository Path</label>
            <input type="text" value={form.repo_path} onChange={e => handleChange('repo_path', e.target.value)} placeholder="e.g. /home/user/project"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Scan Mode</label>
              <select value={form.scan_mode} onChange={e => handleChange('scan_mode', e.target.value)}
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors">
                <option value="full">full</option>
                <option value="diff">diff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Cared Paths</label>
              <input type="text" value={form.cared_paths} onChange={e => handleChange('cared_paths', e.target.value)} placeholder="src/, lib/"
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors" />
            </div>
          </div>
          <div className="pt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors border border-[#30363d]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors shadow-md">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
