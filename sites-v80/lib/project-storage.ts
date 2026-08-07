export type DeepCastProject = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectSourceRecord = {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  detail: string;
  content: string;
  origin: "manual" | "google-drive" | "web" | "deep-research" | "upload" | "website";
  driveFileId?: string;
  url?: string;
  siteName?: string;
  overview?: string;
  overviewTopics?: string[];
  selected?: boolean;
  createdAt: string;
};

export const CUSTOM_PROJECTS_STORAGE_KEY = "deepcast-custom-projects";
export const PROJECT_SOURCES_STORAGE_KEY = "deepcast-project-sources-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readProjects(): DeepCastProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROJECTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const custom = Array.isArray(parsed) ? parsed.filter(isRecord).map((project) => ({
      id: String(project.id || ""),
      title: String(project.title || "Untitled Project"),
      description: typeof project.description === "string" ? project.description : undefined,
      coverImage: typeof project.coverImage === "string" ? project.coverImage : undefined,
      createdAt: typeof project.createdAt === "string" ? project.createdAt : undefined,
      updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : undefined,
    })).filter((project) => project.id) : [];
    return custom;
  } catch {
    return [];
  }
}

export function writeProjects(projects: DeepCastProject[]) {
  window.localStorage.setItem(CUSTOM_PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, 100)));
  window.dispatchEvent(new CustomEvent("deepcast-projects-updated"));
}

export function readAllProjectSources(): Record<string, ProjectSourceRecord[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROJECT_SOURCES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([projectId, sources]) => [
      projectId,
      Array.isArray(sources) ? sources.filter(isRecord).map((source) => ({
        id: String(source.id || ""),
        projectId,
        title: String(source.title || "Untitled Source"),
        kind: String(source.kind || "Project source"),
        detail: String(source.detail || "Saved source"),
        content: String(source.content || "").slice(0, 120_000),
        origin: source.origin === "google-drive" || source.origin === "web" || source.origin === "deep-research" || source.origin === "upload" || source.origin === "website" ? source.origin : "manual",
        driveFileId: typeof source.driveFileId === "string" ? source.driveFileId : undefined,
        url: typeof source.url === "string" ? source.url : undefined,
        siteName: typeof source.siteName === "string" ? source.siteName : undefined,
        overview: typeof source.overview === "string" ? source.overview : undefined,
        overviewTopics: Array.isArray(source.overviewTopics) ? source.overviewTopics.filter((topic): topic is string => typeof topic === "string").slice(0, 8) : undefined,
        selected: source.selected !== false,
        createdAt: String(source.createdAt || new Date().toISOString()),
      })).filter((source) => source.id) : [],
    ]));
  } catch {
    return {};
  }
}

export function readProjectSources(projectId: string) {
  return readAllProjectSources()[projectId] || [];
}

export function writeProjectSources(projectId: string, sources: ProjectSourceRecord[]) {
  const allSources = readAllProjectSources();
  allSources[projectId] = sources;

  // Source rows are the user's library; cached page text is replaceable. Keep
  // every source record and progressively compact only its local excerpt until
  // the complete library fits the browser quota. The former per-source limits
  // let a large project hit localStorage around source 18–20.
  const excerptBudgets = [12_000, 6_000, 2_000, 0];
  let stored = false;
  for (const budget of excerptBudgets) {
    const compacted = Object.fromEntries(Object.entries(allSources).map(([storedProjectId, projectSources]) => [
      storedProjectId,
      projectSources.map((source) => ({
        ...source,
        content: budget ? source.content.slice(0, budget) : "",
        overview: source.overview?.slice(0, 1_500),
      })),
    ]));
    try {
      window.localStorage.setItem(PROJECT_SOURCES_STORAGE_KEY, JSON.stringify(compacted));
      stored = true;
      break;
    } catch {
      // Try the next, smaller excerpt budget without deleting any source rows.
    }
  }
  if (!stored) {
    throw new Error("This browser has run out of local source storage. Every source was preserved in memory, but the updated library could not be saved.");
  }
  window.dispatchEvent(new CustomEvent("deepcast-project-sources-updated", { detail: { projectId } }));
}

export function createSourceId(prefix = "source") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sourceTitleFromContent(content: string) {
  const firstReadableLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  const compact = firstReadableLine.replace(/^[#>*\-\d.\s]+/, "").replace(/\s+/g, " ").trim();
  if (!compact) return "Pasted Source Material";
  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}…` : compact;
}
