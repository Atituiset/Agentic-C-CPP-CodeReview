const API_BASE = "";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function createJob(payload: {
  repo_path?: string;
  mode: "diff" | "files";
  target_commit?: string;
  file_paths?: string[];
}) {
  const res = await fetch(`${API_BASE}/api/jobs`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create job: ${res.status}`);
  return res.json();
}

export async function fetchReports(jobId: string) {
  const res = await fetch(`${API_BASE}/api/reports/${jobId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  return res.json();
}

export async function fetchReportFile(jobId: string, filename: string) {
  const res = await fetch(`${API_BASE}/api/reports/${jobId}/${filename}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
  return res.text();
}

export async function fetchWorkers() {
  const res = await fetch(`${API_BASE}/api/workers`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch workers: ${res.status}`);
  return res.json();
}

export async function fetchVulnerabilities() {
  const res = await fetch(`${API_BASE}/api/vulnerabilities`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch vulnerabilities: ${res.status}`);
  return res.json();
}

export async function acceptVulnerability(id: string) {
  const res = await fetch(`${API_BASE}/api/vulnerabilities/${id}/accept`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to accept vulnerability: ${res.status}`);
  return res.json();
}

export async function rejectVulnerability(id: string) {
  const res = await fetch(`${API_BASE}/api/vulnerabilities/${id}/reject`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to reject vulnerability: ${res.status}`);
  return res.json();
}

export async function fetchMemoryRules() {
  const res = await fetch(`${API_BASE}/api/memory-rules`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch memory rules: ${res.status}`);
  return res.json();
}

export async function createMemoryRule(payload: {
  pattern: string;
  severity: string;
  description?: string;
}) {
  const res = await fetch(`${API_BASE}/api/memory-rules`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create memory rule: ${res.status}`);
  return res.json();
}

export async function deleteMemoryRule(id: string) {
  const res = await fetch(`${API_BASE}/api/memory-rules/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete memory rule: ${res.status}`);
}

export async function approveMemoryRule(id: string) {
  const res = await fetch(`${API_BASE}/api/memory-rules/${id}/approve`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to approve memory rule: ${res.status}`);
  return res.json();
}

export async function submitMemoryRuleForGlobal(id: string) {
  const res = await fetch(`${API_BASE}/api/memory-rules/${id}/submit-global`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to submit rule for global: ${res.status}`);
  return res.json();
}

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/api/users`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json();
}

export async function createUser(payload: {
  username: string;
  password: string;
  display_name?: string;
  role?: string;
}) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create user: ${res.status}`);
  return res.json();
}

export async function deleteUser(id: string) {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete user: ${res.status}`);
}

export async function updateUserShowThinking(show_thinking: boolean) {
  const res = await fetch(`${API_BASE}/api/auth/me/show-thinking?show_thinking=${show_thinking}`, {
    method: "PUT",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to update show thinking: ${res.status}`);
  return res.json();
}

export async function updateWorkerShowThinking(worker_id: string, show_thinking: boolean) {
  const res = await fetch(`${API_BASE}/api/workers/${worker_id}/show-thinking?show_thinking=${show_thinking}`, {
    method: "PUT",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to update worker show thinking: ${res.status}`);
  return res.json();
}

export async function resumeJob(jobId: string) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/resume`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to resume job: ${res.status}`);
  return res.json();
}

export async function cancelJob(jobId: string) {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to cancel job: ${res.status}`);
  return res.json();
}

export async function fetchGitSyncStats() {
  const res = await fetch(`${API_BASE}/api/jobs/stats/git-sync`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch git sync stats: ${res.status}`);
  return res.json();
}

export async function fetchSchedulerStatus(workerId?: string) {
  const url = workerId
    ? `${API_BASE}/api/jobs/scheduler/status?worker_id=${encodeURIComponent(workerId)}`
    : `${API_BASE}/api/jobs/scheduler/status`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch scheduler status: ${res.status}`);
  return res.json();
}

export async function fetchWorkerGitStatus(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/git-status`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch worker git status: ${res.status}`);
  return res.json();
}

export async function fetchAllWorkersGitStatus() {
  const res = await fetch(`${API_BASE}/api/workers/git-status/all`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch all workers git status: ${res.status}`);
  return res.json();
}

export async function fetchWorkerSchedule(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/schedule`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch worker schedule: ${res.status}`);
  return res.json();
}

export async function updateWorkerSchedule(workerId: string, payload: {
  scan_hour?: number;
  scan_minute?: number;
  stop_hour?: number;
  stop_minute?: number;
  is_enabled?: boolean;
  timezone?: string;
}) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/schedule`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update worker schedule: ${res.status}`);
  return res.json();
}

export async function createWorker(payload: {
  worker_id: string;
  hostname?: string;
  ip_address?: string;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_key?: string;
  repo_path?: string;
  scan_mode?: string;
  target_commit?: string;
  cared_paths?: string[];
}) {
  const res = await fetch(`${API_BASE}/api/workers`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create worker: ${res.status}`);
  return res.json();
}

export async function deployWorker(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/deploy`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to deploy worker: ${res.status}`);
  return res.json();
}

export async function deleteWorker(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete worker: ${res.status}`);
}

export async function triggerWorkerScan(workerId: string) {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerId)}/trigger-scan`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to trigger scan: ${res.status}`);
  return res.json();
}
