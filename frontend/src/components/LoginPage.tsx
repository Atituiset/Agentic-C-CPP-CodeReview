import React, { useState } from 'react';
import { User, Lock, ShieldCheck, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError('Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#06090e] text-[#c9d1d9] font-sans items-center justify-center">
      <div className="w-full max-w-md bg-[#0d1117] border border-[#30363d] rounded-xl shadow-xl p-8">
        <div className="flex items-center justify-center mb-8">
          <div className="w-12 h-12 bg-[#1f6feb] rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
            <ShieldCheck className="text-white" size={28} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#e6edf3] text-center mb-2">
          OpenCode
        </h1>
        <p className="text-sm text-[#8b949e] text-center mb-8">
          Sign in to access the Control Plane
        </p>

        {error && (
          <div className="mb-4 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
              Username
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]"
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#8b949e] focus:outline-none focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#8b949e] focus:outline-none focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-md active:scale-95"
          >
            {isLoading ? (
              <Activity className="animate-spin" size={16} />
            ) : null}
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-[#8b949e]">
            Default: <span className="text-[#c9d1d9] font-medium">admin</span> /{' '}
            <span className="text-[#c9d1d9] font-medium">admin123</span>
          </p>
        </div>
      </div>
    </div>
  );
}
