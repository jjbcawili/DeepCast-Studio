"use client";

import { useEffect, useRef } from "react";
import {
  createSourceId,
  readProjectSources,
  writeProjectSources,
  type ProjectSourceRecord,
} from "../../lib/project-storage";
import {
  beginBackgroundJob,
  reconcileBackgroundJobs,
  updateBackgroundJob,
} from "../../lib/background-jobs";
import {
  readSourceImportQueue,
  SOURCE_IMPORT_QUEUE_EVENT,
  writeSourceImportQueue,
  type SourceImportTask,
} from "../../lib/source-import-queue";

type WebsiteResult = {
  error?: string;
  title?: string;
  siteName?: string;
  content?: string;
  url?: string;
  overview?: string;
  topics?: string[];
};

function replaceTask(next: SourceImportTask) {
  writeSourceImportQueue(readSourceImportQueue().map((task) => task.id === next.id ? next : task));
}

function saveImportedSource(task: SourceImportTask, requestedUrl: string, result: WebsiteResult) {
  const resolvedUrl = result.url || requestedUrl;
  const record: ProjectSourceRecord = {
    id: createSourceId("website"),
    projectId: task.projectId,
    title: (result.title || requestedUrl).slice(0, 100),
    siteName: result.siteName,
    kind: /(?:youtube\.com|youtu\.be)/i.test(resolvedUrl) ? "YouTube" : "Website",
    detail: resolvedUrl,
    content: String(result.content || "").slice(0, 120_000),
    overview: result.overview,
    overviewTopics: result.topics || [],
    origin: "website",
    url: resolvedUrl,
    selected: true,
    createdAt: new Date().toISOString(),
  };
  const current = readProjectSources(task.projectId);
  const next = [record, ...current.filter((source) => source.url !== record.url)];
  writeProjectSources(task.projectId, next);
}

export default function SourceImportRunner() {
  const running = useRef(false);

  useEffect(() => {
    let disposed = false;

    async function runQueue() {
      if (running.current || disposed) return;
      const initialQueue = readSourceImportQueue();
      reconcileBackgroundJobs(initialQueue.map((task) => task.jobId));
      const queued = initialQueue.find((task) => task.nextIndex < task.urls.length);
      if (!queued) return;

      running.current = true;
      let task = { ...queued, status: "working" as const, updatedAt: new Date().toISOString() };
      replaceTask(task);
      const job = beginBackgroundJob("ADDING SOURCES", `Adding source ${task.nextIndex + 1} of ${task.urls.length}…`, task.projectId, task.jobId);

      while (!disposed && task.nextIndex < task.urls.length) {
        const index = task.nextIndex;
        const url = task.urls[index];
        const progress = Math.round((index / task.urls.length) * 100);
        updateBackgroundJob(task.jobId, { status: "working", detail: `Adding source ${index + 1} of ${task.urls.length}…`, progress });
        try {
          const response = await fetch("/api/projects/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "website", url }),
          });
          const result = await response.json().catch(() => null) as WebsiteResult | null;
          if (!response.ok || !result?.content) throw new Error(result?.error || "No readable source material was returned.");
          saveImportedSource(task, url, result);
          task = { ...task, nextIndex: index + 1, added: task.added + 1, updatedAt: new Date().toISOString() };
        } catch {
          task = { ...task, nextIndex: index + 1, failures: task.failures + 1, updatedAt: new Date().toISOString() };
        }
        replaceTask(task);
      }

      if (!disposed) {
        writeSourceImportQueue(readSourceImportQueue().filter((item) => item.id !== task.id));
        if (task.added) job.succeed(`${task.added} source${task.added === 1 ? "" : "s"} added${task.failures ? ` · ${task.failures} skipped` : ""}.`);
        else job.fail("No readable sources could be added.");
      }
      running.current = false;
      if (!disposed) window.setTimeout(runQueue, 0);
    }

    const handleQueue = () => { void runQueue(); };
    window.addEventListener(SOURCE_IMPORT_QUEUE_EVENT, handleQueue);
    window.addEventListener("storage", handleQueue);
    void runQueue();
    return () => {
      disposed = true;
      window.removeEventListener(SOURCE_IMPORT_QUEUE_EVENT, handleQueue);
      window.removeEventListener("storage", handleQueue);
    };
  }, []);

  return null;
}
