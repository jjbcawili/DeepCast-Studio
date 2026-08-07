"use client";

export type BackgroundJobStatus = "working" | "success" | "failed";

export type BackgroundJob = {
  id: string;
  projectId?: string;
  label: string;
  detail: string;
  progress?: number;
  status: BackgroundJobStatus;
  updatedAt: string;
};

const STORAGE_KEY = "deepcast-background-jobs-v1";
export const BACKGROUND_JOB_EVENT = "deepcast:background-jobs";

function readJobs(): BackgroundJob[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: BackgroundJob[]) {
  if (typeof window === "undefined") return;
  const unique = [...new Map(jobs.map((job) => [job.id, job])).values()];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique.slice(0, 12)));
  window.dispatchEvent(new CustomEvent(BACKGROUND_JOB_EVENT));
}

export function reconcileBackgroundJobs(activeJobIds: string[]) {
  const active = new Set(activeJobIds);
  const now = Date.now();
  writeJobs(readJobs().filter((job) => {
    if (job.status === "working") return active.has(job.id);
    return now - new Date(job.updatedAt).getTime() < 15_000;
  }));
}

export function updateBackgroundJob(id: string, patch: Partial<BackgroundJob>) {
  const jobs = readJobs();
  const existing = jobs.find((job) => job.id === id);
  if (!existing) return;
  writeJobs(jobs.map((job) => job.id === id ? {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  } : job));
}

export function getBackgroundJobs() {
  return readJobs();
}

export function beginBackgroundJob(label: string, detail: string, projectId?: string, requestedId?: string) {
  const id = requestedId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const started: BackgroundJob = {
    id,
    projectId,
    label,
    detail,
    progress: 0,
    status: "working",
    updatedAt: new Date().toISOString(),
  };
  writeJobs([started, ...readJobs().filter((job) => job.status === "working" && job.id !== id)]);

  function mutate(patch: Partial<BackgroundJob>) {
    const jobs = readJobs();
    writeJobs(jobs.map((job) => job.id === id ? {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    } : job));
  }

  return {
    id,
    update(detailText: string, progress?: number) {
      mutate({ detail: detailText, progress, status: "working" });
    },
    succeed(detailText: string) {
      mutate({ detail: detailText, progress: 100, status: "success" });
    },
    fail(detailText: string) {
      mutate({ detail: detailText, status: "failed" });
    },
  };
}

export function dismissBackgroundJob(id: string) {
  writeJobs(readJobs().filter((job) => job.id !== id));
}
