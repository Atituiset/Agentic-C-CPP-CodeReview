import React, { useState, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { createWorker, fetchDeployKey } from '../hooks/useApi';

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
    ssh_password: '',
    repo_path: '',
    scan_mode: 'full',
    cared_paths: '',
  });
  const [publicKey, setPublicKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeployKey()
      .then(data => setPublicKey(data.public_key))
      .catch(err => console.error('Failed to load deploy key:', err));
  }, []);

  const handleChange = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const deployCommand = publicKey
    ? `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
    : '';

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(deployCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // Fallback
    }
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
        ssh_password: form.ssh_password || undefined,
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

          {/* Deploy Public Key */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#58a6ff] uppercase tracking-wider">
                Deploy Public Key
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                {copied ? <Check size={12} className="text-[#3fb950]" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-[10px] text-[#8b949e] mb-2">
              Run this command on your worker to authorize the deploy key:
            </div>
            <div className="relative">
              <div className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-[11px] text-[#c9d1d9] font-mono break-all">
                {deployCommand}
              </div>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] transition-colors border border-[#30363d]"
              >
                {copiedCmd ? <Check size={10} className="text-[#3fb950]" /> : <Copy size={10} />}
                {copiedCmd ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

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
              SSH Password <span className="text-[#8b949e] font-normal normal-case">(optional)</span>
            </label>
            <input
              type="password"
              value={form.ssh_password}
              onChange={e => handleChange('ssh_password', e.target.value)}
              placeholder="Leave empty to use deploy key"
              className="w-full bg-[#010409] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-colors"
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
