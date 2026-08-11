"use client";

import { useEffect, useState } from "react";
import {
  BACKGROUND_JOB_EVENT,
  dismissBackgroundJob,
  getBackgroundJobs,
  type BackgroundJob,
} from "../../lib/background-jobs";

export default function BackgroundJobTray() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    const sync = () => setJobs(getBackgroundJobs());
    sync();
    window.addEventListener(BACKGROUND_JOB_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BACKGROUND_JOB_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const timers = jobs.filter((job) => job.status !== "working").map((job) => window.setTimeout(() => dismissBackgroundJob(job.id), 6500));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [jobs]);

  const visible = [...new Map(jobs.map((job) => [job.id, job])).values()].slice(0, 3);
  if (!visible.length) return null;

  return (
    <aside className="background-job-tray" aria-label="Background activity" aria-live="polite">
      {visible.map((job) => (
        <div className={`background-job-card ${job.status}`} key={job.id}>
          <span className="background-job-icon" aria-hidden="true">
            {job.status === "working" ? <i /> : job.status === "success" ? "✓" : "!"}
          </span>
          <div>
            <strong>{job.label}</strong>
            <small>{job.detail}{job.status === "working" ? ` · ${Math.max(0, Math.min(100, Math.round(job.progress || 0)))}%` : ""}</small>
            {job.status === "working" && (
              <span className="background-job-progress">
                <i style={{ width: `${Math.max(6, Math.min(100, job.progress || 8))}%` }} />
              </span>
            )}
          </div>
          {job.status !== "working" && <button type="button" onClick={() => dismissBackgroundJob(job.id)} aria-label={`Dismiss ${job.label}`}>×</button>}
        </div>
      ))}
    </aside>
  );
}
