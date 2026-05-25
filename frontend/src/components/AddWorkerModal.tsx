import React, { useState } from 'react';
import { X } from 'lucide-react';
import { createWorker } from '../hooks/useApi';

interface AddWorkerModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddWorkerModal({ onClose, onSuccess }: AddWorkerModalProps) {
  const [form, setForm] = useState({
    worker_id: '',
    ssh_host: '',
    ssh_port: 22,
    ssh_username: '',
    ssh_key: '',
    repo_path: '',
    scan_mode: 'full',
    cared_paths: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        worker_id: form.worker_id,
        ssh_host: form.ssh_host || undefined,
        ssh_port: form.ssh_port || undefined,
        ssh_username: form.ssh_username || undefined,
        ssh_key: form.ssh_key || undefined,
        repo_path: form.repo_path || undefined,
        scan_mode: form.scan_mode,
        cared_paths: form.cared_paths
          ? form.cared_paths.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      };
      await createWorker(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create worker');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#e6edf3]">Add Remote Worker</h2>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-[#f85149] transition-colors p-1 rounded hover:bg-[#30363d]/50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
              Worker ID <span className="text-[#f85149]">*</span>
            </label>
            <input
              type="text"
              required
              value={form.worker_id}
              onChange={e => handleChange('worker_id', e.target.value)}
              placeholder="e.g. my-remote-worker"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
                SSH Host
              </label>
              <input
                type="text"
                value={form.ssh_host}
                onChange={e => handleChange('ssh_host', e.target.value)}
                placeholder="e.g. 192.168.1.100"
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
                SSH Port
              </label>
              <input
                type="number"
                value={form.ssh_port}
                onChange={e => handleChange('ssh_port', parseInt(e.target.value) || 0)}
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
              SSH Username
            </label>
            <input
              type="text"
              value={form.ssh_username}
              onChange={e => handleChange('ssh_username', e.target.value)}
              placeholder="e.g. ubuntu"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
              SSH Private Key
            </label>
            <textarea
              rows={4}
              value={form.ssh_key}
              onChange={e => handleChange('ssh_key', e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
              Repository Path
            </label>
            <input
              type="text"
              value={form.repo_path}
              onChange={e => handleChange('repo_path', e.target.value)}
              placeholder="e.g. /home/user/project"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
                Scan Mode
              </label>
              <select
                value={form.scan_mode}
                onChange={e => handleChange('scan_mode', e.target.value)}
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
              >
                <option value="full">full</option>
                <option value="diff">diff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">
                Cared Paths
              </label>
              <input
                type="text"
                value={form.cared_paths}
                onChange={e => handleChange('cared_paths', e.target.value)}
                placeholder="src/, lib/"
                className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors border border-[#30363d]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors shadow-md"
            >
              {loading ? 'Creating...' : 'Add Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
