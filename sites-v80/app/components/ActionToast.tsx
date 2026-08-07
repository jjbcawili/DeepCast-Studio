"use client";

type ActionToastProps = {
  message: string;
  onDismiss?: () => void;
  progress?: { current: number; total: number } | null;
};

function getState(message: string) {
  if (/\b(fail|failed|could not|cannot|error|invalid|expired|blocked|too large|full|did not|no readable|skipped)\b/i.test(message)) return "error";
  if (/…|\b(adding|loading|reading|importing|uploading|generating|preparing|working|saving|deleting|researching)\b/i.test(message)) return "loading";
  return "success";
}

export default function ActionToast({ message, onDismiss, progress }: ActionToastProps) {
  const state = getState(message);
  const percent = progress?.total ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div key={`${state}-${message}`} className={`action-toast action-toast-${state}`} role={state === "error" ? "alert" : "status"} aria-live="polite" aria-busy={state === "loading"}>
      <i className="action-toast-icon" aria-hidden="true">{state === "loading" ? "" : state === "success" ? "✓" : "!"}</i>
      <div>
        <span>{message}</span>
        {progress && <div className="action-toast-progress" aria-label={`${progress.current} of ${progress.total}`}><span style={{ width: `${percent}%` }} /></div>}
      </div>
      {onDismiss && state !== "loading" && <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>}
    </div>
  );
}
