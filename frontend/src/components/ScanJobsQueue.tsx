import React, { useState, useMemo } from 'react';
import { Layers, Search, X } from 'lucide-react';

export default function ScanJobsQueue({ isScanning, jobs, jobsLoading, onViewReports, setCurrentView }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMode, setFilterMode] = useState('all');

  // If scanning, show a pseudo job
  const activeJobs = isScanning ? [{ id: 'job-current', repo: 'current-workspace', branch: 'local', commit: 'HEAD', status: 'Running', time: 'Started just now', type: 'Interactive Analysis' }] : [];

  const allJobs = [
    ...activeJobs,
    ...jobs.map((j: any) => ({
      id: j.id.slice(0, 8),
      repo: j.repo_path,
      branch: j.mode,
      commit: j.target_commit || 'HEAD',
      status: j.status.charAt(0).toUpperCase() + j.status.slice(1),
      time: j.created_at ? `Created ${new Date(j.created_at).toLocaleString()}` : '',
      type: j.mode === 'diff' ? 'Diff Analysis' : 'Full Analysis',
      rawId: j.id,
      totalFiles: j.total_files || 0,
      completedFiles: j.completed_files || 0,
      failedFiles: j.failed_files || 0,
    }))
  ];

  const filteredJobs = useMemo(() => {
    return allJobs.filter((job: any) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        job.id.toLowerCase().includes(q) ||
        job.repo.toLowerCase().includes(q) ||
        job.branch.toLowerCase().includes(q) ||
        job.commit.toLowerCase().includes(q);

      const matchesStatus = filterStatus === 'all' || job.status === filterStatus;

      const matchesMode = filterMode === 'all' ||
        (filterMode === 'Full Analysis' && job.type === 'Full Analysis') ||
        (filterMode === 'Diff Analysis' && job.type === 'Diff Analysis');

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [allJobs, searchQuery, filterStatus, filterMode]);

  const hasFilters = searchQuery || filterStatus !== 'all' || filterMode !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterMode('all');
  };

  const renderProgress = (job: any) => {
    if (job.totalFiles <= 0) return null;
    const pct = Math.round((job.completedFiles / job.totalFiles) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 bg-[#010409] h-1.5 rounded-full overflow-hidden border border-[#30363d]">
          <div
            className="h-full bg-[#238636] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-[#8b949e] tabular-nums">
          {job.completedFiles}/{job.totalFiles}
        </span>
        {job.failedFiles > 0 && (
          <span className="text-[10px] text-[#f85149]">{job.failedFiles} failed</span>
        )}
      </div>
    );
  };

  const inputBase = 'bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#e6edf3] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 hover:border-[#8b949e]/50 transition-colors';

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
        {/* Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className={`${inputBase} w-full pl-8 pr-8`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={inputBase}
          >
            <option value="all">All Status</option>
            <option value="Running">Running</option>
            <option value="Completed">Completed</option>
            <option value="Queued">Queued</option>
            <option value="Failed">Failed</option>
          </select>

          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className={inputBase}
          >
            <option value="all">All Modes</option>
            <option value="Full Analysis">Full Analysis</option>
            <option value="Diff Analysis">Diff Analysis</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-[#8b949e] hover:text-[#e6edf3] flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Clear filters
            </button>
          )}

          <span className="text-xs text-[#8b949e] ml-auto">
            Showing {filteredJobs.length} of {allJobs.length} jobs
          </span>
        </div>

        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0d1117] text-[#8b949e] text-[11px] font-bold uppercase tracking-wider border-b border-[#30363d]">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">Repository</th>
                <th className="px-5 py-3">Branch / Commit</th>
                <th className="px-5 py-3">Job Type</th>
                <th className="px-5 py-3 text-center">Progress</th>
                <th className="px-5 py-3 text-right">Timing</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {filteredJobs.map((job: any) => (
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
                  <td className="px-5 py-4 text-center">
                    {renderProgress(job)}
                  </td>
                  <td className="px-5 py-4 text-[#8b949e] text-xs text-right whitespace-nowrap">{job.time}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                      job.status === 'Running' ? 'text-[#58a6ff] bg-[#58a6ff]/10 border-[#58a6ff]/20 animate-pulse' :
                      job.status === 'Completed' ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20' :
                      job.status === 'Queued' ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20' :
                      'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20'
                    }`}>{job.status}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {job.rawId && (
                      <button
                        onClick={() => { onViewReports(job.rawId); setCurrentView('report'); }}
                        className="text-xs text-[#58a6ff] hover:text-[#79c0ff] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View Reports →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-[#8b949e] text-sm">
                    {jobsLoading ? 'Loading jobs...' : 'No jobs match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
