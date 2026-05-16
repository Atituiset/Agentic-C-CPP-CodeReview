import React, { useState, useEffect, useMemo } from 'react';
import { Database, Globe, User, Plus, X, Loader2, Trash2, CheckCircle, Clock, ShieldCheck, ArrowUpCircle } from 'lucide-react';
import { fetchMemoryRules, createMemoryRule, deleteMemoryRule, approveMemoryRule, submitMemoryRuleForGlobal } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

interface MemoryRule {
  id: string;
  title: string;
  description?: string;
  rule_type: 'positive' | 'negative';
  file_pattern?: string;
  vuln_type_filter?: string;
  scope: 'global' | 'personal';
  status: 'active' | 'pending';
  created_by: string;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
}

export default function MemoryManager() {
  const { user } = useAuth();
  const [rules, setRules] = useState<MemoryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isCommitter = user?.role === 'committer' || user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'global' | 'personal'>(isCommitter ? 'global' : 'personal');
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formRuleType, setFormRuleType] = useState<'positive' | 'negative'>('positive');
  const [formFilePattern, setFormFilePattern] = useState('');
  const [formVulnTypeFilter, setFormVulnTypeFilter] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemoryRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load memory rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  // For regular users: only show their personal rules
  const filteredRules = useMemo(() => {
    if (isCommitter) {
      return rules.filter((r) => r.scope === activeTab);
    }
    return rules.filter((r) => r.scope === 'personal' && r.created_by === user?.id);
  }, [rules, activeTab, isCommitter, user]);

  // Track which personal rules have been submitted for global approval
  const globalizedTitles = useMemo(() => {
    const titles = new Set<string>();
    rules.forEach((r) => {
      if (r.scope === 'global' && r.created_by === user?.id) {
        titles.add(r.title);
      }
    });
    return titles;
  }, [rules, user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setFormSubmitting(true);
    try {
      await createMemoryRule({
        title: formTitle.trim(),
        rule_type: formRuleType,
        file_pattern: formFilePattern.trim() || undefined,
        vuln_type_filter: formVulnTypeFilter.trim() || undefined,
        description: formDescription.trim() || undefined,
        scope: isCommitter ? activeTab : 'personal',
      } as any);
      setFormTitle('');
      setFormRuleType('positive');
      setFormFilePattern('');
      setFormVulnTypeFilter('');
      setFormDescription('');
      setShowForm(false);
      await loadRules();
    } catch (err: any) {
      setError(err.message || 'Failed to create memory rule');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!isCommitter) return;
    setActionLoading(id + ':approve');
    try {
      await approveMemoryRule(id);
      await loadRules();
    } catch (err: any) {
      setError(err.message || 'Failed to approve memory rule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitForGlobal = async (id: string) => {
    if (isCommitter) return;
    setActionLoading(id + ':submit-global');
    try {
      await submitMemoryRuleForGlobal(id);
      await loadRules();
    } catch (err: any) {
      setError(err.message || 'Failed to submit rule for global approval');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id + ':delete');
    try {
      await deleteMemoryRule(id);
      setDeleteConfirmId(null);
      await loadRules();
    } catch (err: any) {
      setError(err.message || 'Failed to delete memory rule');
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const inputBase = 'bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 hover:border-[#8b949e]/50 transition-colors w-full';

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      {/* Header */}
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
            Memory Manager
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#21262d] border border-[#30363d] px-2.5 py-0.5 rounded-full text-[#8b949e] flex items-center gap-1.5 shadow-sm">
              <Database size={10} className="text-[#58a6ff]" /> Rule Engine
            </span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Manage positive and negative memory rules for vulnerability scanning</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-md transition-colors shadow-sm"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'New Rule'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        {/* Tabs — only for committer/admin */}
        {isCommitter && (
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => { setActiveTab('global'); setShowForm(false); setDeleteConfirmId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'global'
                  ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <Globe size={16} className={activeTab === 'global' ? 'text-[#58a6ff]' : ''} />
              Global
            </button>
            <button
              onClick={() => { setActiveTab('personal'); setShowForm(false); setDeleteConfirmId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'personal'
                  ? 'bg-[#21262d] text-[#e6edf3] border border-[#30363d]/50 shadow-sm'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <User size={16} className={activeTab === 'personal' ? 'text-[#58a6ff]' : ''} />
              Personal
            </button>
          </div>
        )}

        {!isCommitter && (
          <div className="mb-6 text-sm text-[#8b949e]">
            <p>Your personal memory rules. Submit a rule for global approval to share it with the team.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 bg-[#f85149]/10 border border-[#f85149]/20 rounded-md text-sm text-[#f85149]">
            {error}
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-[#e6edf3] mb-4 flex items-center gap-2">
              <Plus size={16} className="text-[#58a6ff]" />
              Create {isCommitter && activeTab === 'global' ? 'Global' : 'Personal'} Rule
            </h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Ignore false positives in test files"
                  className={inputBase}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Rule Type</label>
                <select
                  value={formRuleType}
                  onChange={(e) => setFormRuleType(e.target.value as 'positive' | 'negative')}
                  className={inputBase}
                >
                  <option value="positive">Positive (promote)</option>
                  <option value="negative">Negative (suppress)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">File Pattern</label>
                <input
                  type="text"
                  value={formFilePattern}
                  onChange={(e) => setFormFilePattern(e.target.value)}
                  placeholder="e.g. *.test.js, src/tests/**"
                  className={inputBase}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Vulnerability Type Filter</label>
                <input
                  type="text"
                  value={formVulnTypeFilter}
                  onChange={(e) => setFormVulnTypeFilter(e.target.value)}
                  placeholder="e.g. SAST, NGA, or specific type"
                  className={inputBase}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the purpose of this rule..."
                  rows={3}
                  className={`${inputBase} resize-none`}
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || !formTitle.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#238636]/50 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
                >
                  {formSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rules List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#58a6ff] animate-spin" />
            <span className="ml-3 text-sm text-[#8b949e]">Loading memory rules...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8b949e]">
            <Database size={48} className="opacity-30 mb-4" />
            <p className="text-sm">No {activeTab} memory rules found.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-[#58a6ff] hover:underline text-sm"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredRules.map((rule) => (
              <div
                key={rule.id}
                className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5 shadow-sm hover:border-[#8b949e]/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#e6edf3] truncate" title={rule.title}>
                      {rule.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                        rule.rule_type === 'positive'
                          ? 'bg-[#238636]/10 text-[#3fb950] border-[#238636]/20'
                          : 'bg-[#f85149]/10 text-[#f85149] border-[#f85149]/20'
                      }`}
                    >
                      {rule.rule_type}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                        rule.status === 'active'
                          ? 'bg-[#3fb950]/10 text-[#3fb950] border-[#3fb950]/20'
                          : 'bg-[#d29922]/10 text-[#d29922] border-[#d29922]/20'
                      }`}
                    >
                      {rule.status}
                    </span>
                  </div>
                </div>

                {rule.description && (
                  <p className="text-xs text-[#8b949e] mb-3 leading-relaxed">{rule.description}</p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {rule.file_pattern && (
                    <span className="text-[11px] font-mono bg-[#161b22] border border-[#30363d] text-[#58a6ff] px-2 py-1 rounded">
                      {rule.file_pattern}
                    </span>
                  )}
                  {rule.vuln_type_filter && (
                    <span className="text-[11px] font-mono bg-[#161b22] border border-[#30363d] text-[#d29922] px-2 py-1 rounded">
                      {rule.vuln_type_filter}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#30363d]">
                  <div className="flex items-center gap-3 text-[10px] text-[#8b949e]">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatTimestamp(rule.created_at)}
                    </span>
                    {rule.approved_at && (
                      <span className="flex items-center gap-1 text-[#3fb950]">
                        <ShieldCheck size={12} />
                        {formatTimestamp(rule.approved_at)}
                      </span>
                    )}
                    {!isCommitter && globalizedTitles.has(rule.title) && (
                      <span className="flex items-center gap-1 text-[#58a6ff]">
                        <Globe size={12} />
                        Globalized
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isCommitter && activeTab === 'global' && rule.status === 'pending' && (
                      <button
                        onClick={() => handleApprove(rule.id)}
                        disabled={actionLoading === rule.id + ':approve'}
                        title="Approve"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#238636]/10 border border-[#238636]/20 text-[#3fb950] hover:bg-[#238636]/20 transition-colors disabled:opacity-50 text-xs font-medium"
                      >
                        {actionLoading === rule.id + ':approve' ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Approve
                      </button>
                    )}

                    {!isCommitter && !globalizedTitles.has(rule.title) && (
                      <button
                        onClick={() => handleSubmitForGlobal(rule.id)}
                        disabled={actionLoading === rule.id + ':submit-global'}
                        title="Submit for Global Approval"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#58a6ff]/10 border border-[#58a6ff]/20 text-[#58a6ff] hover:bg-[#58a6ff]/20 transition-colors disabled:opacity-50 text-xs font-medium"
                      >
                        {actionLoading === rule.id + ':submit-global' ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ArrowUpCircle size={12} />
                        )}
                        Submit Global
                      </button>
                    )}

                    {deleteConfirmId === rule.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#f85149]">Sure?</span>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={actionLoading === rule.id + ':delete'}
                          className="px-2 py-1 rounded bg-[#f85149] text-white text-[10px] font-medium hover:bg-[#da3633] transition-colors disabled:opacity-50"
                        >
                          {actionLoading === rule.id + ':delete' ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            'Yes'
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[10px] font-medium hover:text-[#e6edf3] transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(rule.id)}
                        title="Delete"
                        className="p-1.5 rounded bg-[#f85149]/10 border border-[#f85149]/20 text-[#f85149] hover:bg-[#f85149]/20 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
