import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Loader2, ScrollText } from 'lucide-react';
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

export default function ReportViewer({ jobId, onBack }: ReportViewerProps) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

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
    fetchReportFile(jobId, selectedReport)
      .then((text) => setReportContent(text))
      .catch((err) => setReportContent(`Error loading report: ${err.message}`))
      .finally(() => setContentLoading(false));
  }, [selectedReport, jobId]);

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
            <h2 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Available Reports & Logs</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-[#58a6ff]" size={20} />
              </div>
            ) : error ? (
              <div className="px-4 py-4 text-xs text-[#f85149]">{error}</div>
            ) : reports.length === 0 ? (
              <div className="px-4 py-4 text-xs text-[#8b949e]">No reports found for this job.</div>
            ) : (
              reports.map((report) => (
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
                <div className="px-5 py-3 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#e6edf3] font-mono flex items-center gap-2">
                    {reports.find(r => r.path === selectedReport)?.type === 'log' ? (
                      <ScrollText size={16} className="text-[#d29922]" />
                    ) : (
                      <FileText size={16} className="text-[#58a6ff]" />
                    )}
                    {reports.find(r => r.path === selectedReport)?.filename || selectedReport}
                  </h2>
                </div>
                <div className="p-6 prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-[#c9d1d9]">
                    {reportContent}
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
