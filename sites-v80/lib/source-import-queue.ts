"use client";

export type SourceImportTask = {
  id: string;
  jobId: string;
  projectId: string;
  urls: string[];
  nextIndex: number;
  added: number;
  failures: number;
  status: "queued" | "working";
  updatedAt: string;
};

const QUEUE_KEY = "deepcast-source-import-queue-v1";
export const SOURCE_IMPORT_QUEUE_EVENT = "deepcast:source-import-queue";

export function readSourceImportQueue(): SourceImportTask[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((task) => task && Array.isArray(task.urls) && task.projectId) : [];
  } catch {
    return [];
  }
}

export function writeSourceImportQueue(tasks: SourceImportTask[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent(SOURCE_IMPORT_QUEUE_EVENT));
}

export function enqueueSourceImport(projectId: string, urls: string[]) {
  const stamp = Date.now();
  const task: SourceImportTask = {
    id: `source-import-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: `job-source-import-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    urls,
    nextIndex: 0,
    added: 0,
    failures: 0,
    status: "queued",
    updatedAt: new Date().toISOString(),
  };
  writeSourceImportQueue([...readSourceImportQueue(), task]);
  return task;
}
