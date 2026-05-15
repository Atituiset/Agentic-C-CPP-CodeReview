const API_BASE = "";

export async function fetchJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create job: ${res.status}`);
  return res.json();
}

export async function fetchReports(jobId: string) {
  const res = await fetch(`${API_BASE}/api/reports/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  return res.json();
}

export async function fetchReportFile(jobId: string, filename: string) {
  const res = await fetch(`${API_BASE}/api/reports/${jobId}/${filename}`);
  if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
  return res.text();
}

export async function fetchWorkers() {
  const res = await fetch(`${API_BASE}/api/workers`);
  if (!res.ok) throw new Error(`Failed to fetch workers: ${res.status}`);
  return res.json();
}
