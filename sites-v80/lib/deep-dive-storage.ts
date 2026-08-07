export type StoredDeepDiveStatus = "Draft" | "Submitted" | "Ready to Generate" | "Generating" | "Partial" | "Audio Ready" | "Failed";

export type StoredDeepDive = {
  id: string;
  title: string;
  topic: string;
  projectId?: string;
  projectTitle: string;
  format: "deep-dive" | "debate" | "brief" | "critique";
  targetLength: string;
  createdAt: string;
  updatedAt: string;
  status: StoredDeepDiveStatus;
  backgroundJobId?: string;
  progress?: number;
  generationStage?: string;
  generationError?: string;
  backgroundSegments?: Array<{ id: number; status: "queued" | "processing" | "complete" | "failed"; error?: string }>;
  engine?: "Gemini TTS" | "Eleven v3" | "Multilingual v2 fallback";
  coverImage?: string;
  runtimeSeconds?: number;
  summary?: string;
  outline: Array<{ number: number; title: string; summary: string }>;
  segments: Array<{ id: number; title: string; script: string }>;
};

export const DEEP_DIVES_STORAGE_KEY = "deepcast-deep-dives-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readDeepDives(): StoredDeepDive[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEEP_DIVES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((item) => ({
      id: String(item.id || ""),
      title: String(item.title || "Untitled Deep Dive"),
      topic: String(item.topic || ""),
      projectId: typeof item.projectId === "string" ? item.projectId : undefined,
      projectTitle: String(item.projectTitle || "Independent Episode"),
      format: item.format === "debate" || item.format === "brief" || item.format === "critique" ? item.format : "deep-dive",
      targetLength: String(item.targetLength || "flexible"),
      createdAt: String(item.createdAt || new Date().toISOString()),
      updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString()),
      status: item.status === "Draft" || item.status === "Submitted" || item.status === "Ready to Generate" || item.status === "Generating" || item.status === "Partial" || item.status === "Failed" ? item.status : "Audio Ready",
      backgroundJobId: typeof item.backgroundJobId === "string" ? item.backgroundJobId : undefined,
      progress: Number.isFinite(Number(item.progress)) ? Number(item.progress) : undefined,
      generationStage: typeof item.generationStage === "string" ? item.generationStage : undefined,
      generationError: typeof item.generationError === "string" ? item.generationError : undefined,
      backgroundSegments: Array.isArray(item.backgroundSegments) ? item.backgroundSegments.filter(isRecord).map((segment) => ({
        id: Number(segment.id),
        status: segment.status === "processing" || segment.status === "complete" || segment.status === "failed" ? segment.status : "queued",
        error: typeof segment.error === "string" ? segment.error : undefined,
      })) : undefined,
      engine: item.engine === "Eleven v3" || item.engine === "Multilingual v2 fallback"
        ? item.engine
        : "Gemini TTS",
      coverImage: typeof item.coverImage === "string" ? item.coverImage : undefined,
      runtimeSeconds: Number.isFinite(Number(item.runtimeSeconds)) ? Number(item.runtimeSeconds) : undefined,
      summary: typeof item.summary === "string" && item.summary.trim()
        ? item.summary.trim()
        : Array.isArray(item.outline)
          ? item.outline.filter(isRecord).slice(0, 2).map((entry) => String(entry.summary || "")).filter(Boolean).join(" ")
          : String(item.topic || ""),
      outline: Array.isArray(item.outline) ? item.outline.filter(isRecord).map((entry, index) => ({ number: Number(entry.number) || index + 1, title: String(entry.title || `Segment ${index + 1}`), summary: String(entry.summary || "") })) : [],
      segments: Array.isArray(item.segments) ? item.segments.filter(isRecord).map((entry, index) => ({ id: Number(entry.id) || index + 1, title: String(entry.title || `Segment ${index + 1}`), script: String(entry.script || "") })) : [],
    })).filter((item) => item.id);
  } catch {
    return [];
  }
}

export function writeDeepDives(items: StoredDeepDive[]) {
  window.localStorage.setItem(DEEP_DIVES_STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
  window.dispatchEvent(new CustomEvent("deepcast-deep-dives-updated"));
}

export function saveDeepDive(item: StoredDeepDive) {
  const current = readDeepDives();
  const next = [item, ...current.filter((entry) => entry.id !== item.id)];
  writeDeepDives(next);
}
