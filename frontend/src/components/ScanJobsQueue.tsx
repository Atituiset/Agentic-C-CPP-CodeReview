import React from 'react';
import { Layers } from 'lucide-react';

export default function ScanJobsQueue({ isScanning, jobs, jobsLoading, onViewReports, setCurrentView }: any) {
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
                <th className="px-5 py-3 text-center">Progress</th>
                <th className="px-5 py-3 text-right">Timing</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {allJobs.map((job) => (
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
