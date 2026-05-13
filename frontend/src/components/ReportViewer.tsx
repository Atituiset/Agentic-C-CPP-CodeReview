import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, FileText, Loader2, ScrollText, Search, X } from 'lucide-react';
import { fetchReports, fetchReportFile } from '../hooks/useApi';

interface ReportViewerProps {
  jobId: string;
  onBack: () => void;
}

interface ReportItem {
  filename: string;
  path: string;
  size: number;
  type: string;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function ReportViewer({ jobId, onBack }: ReportViewerProps) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const [sidebarQuery, setSidebarQuery] = useState('');
  const [contentQuery, setContentQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchReports(jobId)
      .then((data) => {
        setReports(data.reports || []);
        if (data.reports?.length > 0) {
          setSelectedReport(data.reports[0].path);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    if (!selectedReport) return;
    setContentLoading(true);
    setContentQuery('');
    fetchReportFile(jobId, selectedReport)
      .then((text) => setReportContent(text))
      .catch((err) => setReportContent(`Error loading report: ${err.message}`))
      .finally(() => setContentLoading(false));
  }, [selectedReport, jobId]);

  const filteredReports = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => r.filename.toLowerCase().includes(q));
  }, [reports, sidebarQuery]);

  const highlightedContent = useMemo(() => {
    if (!contentQuery.trim()) {
      return reportContent.split('\n').map((line, i) => (
        <div key={i} className="min-h-[1.2em]">{line || ' '}</div>
      ));
    }

    const q = escapeRegExp(contentQuery);
    const regex = new RegExp(`(${q})`, 'gi');
    let matchCount = 0;

    const lines = reportContent.split('\n').map((line, i) => {
      if (!regex.test(line)) {
        return <div key={i} className="min-h-[1.2em] opacity-30">{line || ' '}</div>;
      }
      const parts = line.split(regex);
      matchCount++;
      return (
        <div key={i} className="min-h-[1.2em]">
          {parts.map((part, j) =>
            regex.test(part) ? (
              <mark key={j} className="bg-[#d29922]/30 text-[#e6edf3] rounded px-0.5">
                {part}
              </mark>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </div>
      );
    });

    return lines;
  }, [reportContent, contentQuery]);

  const matchCount = useMemo(() => {
    if (!contentQuery.trim()) return 0;
    const q = escapeRegExp(contentQuery);
    const regex = new RegExp(q, 'gi');
    return reportContent.split('\n').filter((line) => regex.test(line)).length;
  }, [reportContent, contentQuery]);

  const inputBase = 'bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#e6edf3] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 hover:border-[#8b949e]/50 transition-colors';

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} /> <span className="text-xs font-semibold">Back</span>
          </button>
          <div className="h-6 w-px bg-[#30363d] hidden sm:block"></div>
          <div>
            <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
              <FileText className="text-[#8b949e]" /> Reports
              <span className="font-mono text-xs bg-[#21262d] border border-[#30363d] px-2 py-0.5 rounded text-[#58a6ff]">{jobId.slice(0, 8)}</span>
            </h1>
            <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Generated analysis reports for this scan job</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Report List */}
        <div className="w-72 bg-[#0d1117] border-r border-[#30363d] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">Available Reports & Logs</h2>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#484f58]" />
              <input
                type="text"
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Filter files..."
                className={`${inputBase} w-full pl-8 pr-7 text-xs py-1`}
              />
              {sidebarQuery && (
                <button
                  onClick={() => setSidebarQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-[#58a6ff]" size={20} />
              </div>
            ) : error ? (
              <div className="px-4 py-4 text-xs text-[#f85149]">{error}</div>
            ) : filteredReports.length === 0 ? (
              <div className="px-4 py-4 text-xs text-[#8b949e]">No reports match your filter.</div>
            ) : (
              filteredReports.map((report) => (
                <button
                  key={report.path}
                  onClick={() => setSelectedReport(report.path)}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-[#30363d]/50 transition-colors ${
                    selectedReport === report.path
                      ? 'bg-[#21262d] text-[#e6edf3] border-l-2 border-l-[#58a6ff]'
                      : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {report.type === 'log' ? (
                      <ScrollText size={14} className="text-[#d29922] shrink-0" />
                    ) : (
                      <FileText size={14} className="text-[#58a6ff] shrink-0" />
                    )}
                    <span className="font-medium truncate">{report.filename}</span>
                  </div>
                  <div className="text-[10px] text-[#8b949e] mt-0.5 pl-6">{(report.size / 1024).toFixed(1)} KB</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-[#06090e]">
          {contentLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-[#58a6ff]" size={24} />
            </div>
          ) : selectedReport ? (
            <div className="p-8 max-w-4xl">
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-sm font-semibold text-[#e6edf3] font-mono flex items-center gap-2">
                    {reports.find(r => r.path === selectedReport)?.type === 'log' ? (
                      <ScrollText size={16} className="text-[#d29922]" />
                    ) : (
                      <FileText size={16} className="text-[#58a6ff]" />
                    )}
                    {reports.find(r => r.path === selectedReport)?.filename || selectedReport}
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#484f58]" />
                      <input
                        type="text"
                        value={contentQuery}
                        onChange={(e) => setContentQuery(e.target.value)}
                        placeholder="Search in content..."
                        className={`${inputBase} w-56 pl-8 pr-7 text-xs py-1`}
                      />
                      {contentQuery && (
                        <button
                          onClick={() => setContentQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    {contentQuery && (
                      <span className="text-[10px] text-[#8b949e]">
                        {matchCount} match{matchCount !== 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-6 prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-[#c9d1d9]">
                    {highlightedContent}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[#8b949e]">
              <div className="text-center">
                <FileText size={48} className="opacity-30 mx-auto mb-4" />
                <p className="text-sm">Select a report from the sidebar to view its contents.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
