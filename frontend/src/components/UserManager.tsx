import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Loader2, Trash2, Shield, UserCheck, User, Clock } from 'lucide-react';
import { fetchUsers, createUser, deleteUser } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

interface UserItem {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'committer' | 'user';
  created_at: string;
}

export default function UserManager() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'committer' | 'user'>('user');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formPassword.trim()) return;

    setFormSubmitting(true);
    try {
      await createUser({
        username: formUsername.trim(),
        password: formPassword.trim(),
        display_name: formDisplayName.trim() || undefined,
        role: formRole,
      });
      setFormUsername('');
      setFormDisplayName('');
      setFormPassword('');
      setFormRole('user');
      setShowForm(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id + ':delete');
    try {
      await deleteUser(id);
      setDeleteConfirmId(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
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

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full bg-[#06090e] items-center justify-center text-[#8b949e]">
        <Shield size={48} className="opacity-30 mb-4" />
        <h2 className="text-xl font-semibold mb-2 text-[#e6edf3]">Access Denied</h2>
        <p className="text-sm">You must be an admin to access User Management.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#06090e]">
      {/* Header */}
      <header className="px-8 py-5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] flex items-center gap-3">
            User Management
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#21262d] border border-[#30363d] px-2.5 py-0.5 rounded-full text-[#8b949e] flex items-center gap-1.5 shadow-sm">
              <Users size={10} className="text-[#58a6ff]" /> Admin
            </span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-1.5 hidden sm:block">Manage users, roles, and access permissions</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-md transition-colors shadow-sm"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
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
              Create New User
            </h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. johndoe"
                  className={inputBase}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className={inputBase}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Enter password"
                  className={inputBase}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'admin' | 'committer' | 'user')}
                  className={inputBase}
                >
                  <option value="admin">Admin</option>
                  <option value="committer">Committer</option>
                  <option value="user">User</option>
                </select>
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
                  disabled={formSubmitting || !formUsername.trim() || !formPassword.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#238636]/50 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
                >
                  {formSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create User
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-sm overflow-hidden flex flex-col h-full max-h-[800px]">
          <div className="px-5 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#e6edf3]">All Users</h2>
            <div className="flex items-center gap-2">
              <span className="bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <Users size={14} className="text-[#58a6ff]" /> {users.length} total
              </span>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="text-[#58a6ff] animate-spin" />
                <span className="ml-3 text-sm text-[#8b949e]">Loading users...</span>
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap lg:whitespace-normal">
                <thead className="bg-[#0d1117] text-[#8b949e] text-[11px] font-bold uppercase tracking-wider border-b border-[#30363d] sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#161b22] transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="text-[#e6edf3] text-[13px] font-medium">{u.display_name || u.username}</span>
                          {u.display_name && (
                            <span className="text-[#8b949e] text-xs">@{u.username}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${
                          u.role === 'admin'
                            ? 'bg-[#f85149]/10 text-[#f85149] border-[#f85149]/20'
                            : u.role === 'committer'
                            ? 'bg-[#d29922]/10 text-[#d29922] border-[#d29922]/20'
                            : 'bg-[#8b949e]/10 text-[#8b949e] border-[#30363d]'
                        }`}>
                          {u.role === 'admin' && <Shield size={12} />}
                          {u.role === 'committer' && <UserCheck size={12} />}
                          {u.role === 'user' && <User size={12} />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#8b949e] text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTimestamp(u.created_at)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {deleteConfirmId === u.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[10px] text-[#f85149]">Sure?</span>
                            <button
                              onClick={() => handleDelete(u.id)}
                              disabled={actionLoading === u.id + ':delete'}
                              className="px-2 py-1 rounded bg-[#f85149] text-white text-[10px] font-medium hover:bg-[#da3633] transition-colors disabled:opacity-50"
                            >
                              {actionLoading === u.id + ':delete' ? (
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
                            onClick={() => setDeleteConfirmId(u.id)}
                            title="Delete user"
                            className="p-1.5 rounded bg-[#f85149]/10 border border-[#f85149]/20 text-[#f85149] hover:bg-[#f85149]/20 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-[#8b949e] text-sm">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
