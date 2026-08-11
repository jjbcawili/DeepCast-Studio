export type EpisodePlaybackProgress = {
  currentTime: number;
  duration: number;
  percent: number;
  completed: boolean;
  updatedAt: string;
};

const PLAYBACK_PROGRESS_KEY = "deepcast-playback-progress-v1";

function readAll(): Record<string, EpisodePlaybackProgress> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAYBACK_PROGRESS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readPlaybackProgress(id: string): EpisodePlaybackProgress | null {
  return readAll()[id] || null;
}

export function readAllPlaybackProgress() {
  return readAll();
}

export function savePlaybackProgress(id: string, currentTime: number, duration: number) {
  if (!id || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
  const percent = Math.max(0, Math.min(100, (currentTime / duration) * 100));
  const next = {
    ...readAll(),
    [id]: {
      currentTime,
      duration,
      percent,
      completed: percent >= 97,
      updatedAt: new Date().toISOString(),
    },
  };
  try {
    window.localStorage.setItem(PLAYBACK_PROGRESS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("deepcast-playback-progress", { detail: { id, progress: next[id] } }));
  } catch {
    // Playback continues even when private browsing blocks persistent storage.
  }
}

export function deletePlaybackProgress(id: string) {
  const next = readAll();
  delete next[id];
  try {
    window.localStorage.setItem(PLAYBACK_PROGRESS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("deepcast-playback-progress", { detail: { id } }));
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
