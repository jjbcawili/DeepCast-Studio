"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  createSourceId,
  readProjectSources,
  readProjects,
  sourceTitleFromContent,
  writeProjects,
  writeProjectSources,
  type DeepCastProject,
  type ProjectSourceRecord,
} from "../../../lib/project-storage";
import { AUTO_COVER_OPTIONS, automaticCoverFor } from "../../../lib/cover-art";
import { readDeepDives, type StoredDeepDive } from "../../../lib/deep-dive-storage";
import ActionToast from "../../components/ActionToast";
import ProjectWorkspaceHeader from "../../components/ProjectWorkspaceHeader";
import { beginBackgroundJob } from "../../../lib/background-jobs";
import { enqueueSourceImport } from "../../../lib/source-import-queue";

type ProjectTab = "overview" | "sources";
type SourceModalMode = "options" | "search" | "website" | "paste";
type ResearchMode = "balanced" | "fast" | "deep";

type ResearchResponse = {
  error?: string;
  mode?: ResearchMode;
  query?: string;
  document?: string;
  references?: Array<{ title: string; url: string }>;
  title?: string;
  siteName?: string;
  content?: string;
  url?: string;
  overview?: string;
  topics?: string[];
};

export default function ProjectWorkspacePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params.projectId || ""));
  const [project, setProject] = useState<DeepCastProject | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [sources, setSources] = useState<ProjectSourceRecord[]>([]);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceModalMode, setSourceModalMode] = useState<SourceModalMode>("options");
  const [sourceContent, setSourceContent] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [researchMode, setResearchMode] = useState<ResearchMode>("balanced");
  const [researching, setResearching] = useState(false);
  const [websiteUrls, setWebsiteUrls] = useState("");
  const [uploading, setUploading] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCoverImage, setEditCoverImage] = useState("");
  const [editCoverName, setEditCoverName] = useState("");
  const [notice, setNotice] = useState("");
  const [deepDives, setDeepDives] = useState<StoredDeepDive[]>([]);
  const [deletingSources, setDeletingSources] = useState(false);
  const [deleteSourceIds, setDeleteSourceIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const selected = readProjects().find((item) => item.id === projectId) || null;
      setProject(selected);
      setSources(selected ? readProjectSources(projectId) : []);
      setDeepDives(readDeepDives().filter((episode) => episode.projectId === projectId));
      setActiveTab(new URLSearchParams(window.location.search).get("tab") === "sources" ? "sources" : "overview");
      setLoaded(true);
    }, 0);

    function syncHistory() {
      setActiveTab(new URLSearchParams(window.location.search).get("tab") === "sources" ? "sources" : "overview");
    }
    window.addEventListener("popstate", syncHistory);
    const syncSources = () => setSources(readProjectSources(projectId));
    window.addEventListener("deepcast-project-sources-updated", syncSources);
    window.addEventListener("storage", syncSources);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", syncHistory);
      window.removeEventListener("deepcast-project-sources-updated", syncSources);
      window.removeEventListener("storage", syncSources);
    };
  }, [projectId]);

  const activeSource = useMemo(() => sources.find((source) => source.id === activeSourceId) || null, [activeSourceId, sources]);
  const selectedSources = useMemo(() => sources.filter((source) => source.selected !== false), [sources]);
  const audioReadyCount = deepDives.filter((episode) => episode.status === "Audio Ready").length;

  function sourceSiteName(source: ProjectSourceRecord) {
    if (source.siteName) return source.siteName;
    if (!source.url) return "";
    try {
      const host = new URL(source.url).hostname.replace(/^www\./, "");
      if (host.endsWith("wikipedia.org")) return "Wikipedia";
      if (host.endsWith("youtube.com") || host === "youtu.be") return "YouTube";
      if (host.endsWith("rollingstone.com")) return "Rolling Stone";
      if (host.endsWith("billboard.com")) return "Billboard";
      return host;
    } catch {
      return "";
    }
  }

  function sourceDisplayTitle(source: ProjectSourceRecord) {
    const site = sourceSiteName(source);
    return site && !source.title.toLowerCase().endsWith(`— ${site.toLowerCase()}`)
      ? `${source.title} — ${site}`
      : source.title;
  }

  function sourceBrief(source: ProjectSourceRecord) {
    const text = (source.overview || source.content || "").replace(/\s+/g, " ").trim();
    return `${text.slice(0, 240)}${text.length > 240 ? "…" : ""}`;
  }

  function chooseTab(tab: ProjectTab) {
    setActiveTab(tab);
    const next = new URL(window.location.href);
    if (tab === "sources") next.searchParams.set("tab", "sources");
    else next.searchParams.delete("tab");
    window.history.pushState({}, "", `${next.pathname}${next.search}`);
  }

  function openEditProject() {
    if (!project) return;
    setEditTitle(project.title);
    setEditDescription(project.description || "");
    setEditCoverImage(project.coverImage || automaticCoverFor(project.id));
    setEditCoverName(project.coverImage ? "Current project cover" : "Automatic project cover");
    setEditModalOpen(true);
  }

  function closeEditProject() {
    setEditModalOpen(false);
    setEditCoverName("");
  }

  function handleEditProjectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Project photos must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setEditCoverImage(reader.result);
      setEditCoverName(file.name);
    };
    reader.onerror = () => setNotice("That image could not be read. Try another file.");
    reader.readAsDataURL(file);
  }

  function saveProjectEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !editTitle.trim()) return;
    const updatedProject: DeepCastProject = {
      ...project,
      title: editTitle.trim().slice(0, 90),
      description: editDescription.trim().slice(0, 500) || undefined,
      coverImage: editCoverImage || undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      writeProjects(readProjects().map((item) => item.id === projectId ? updatedProject : item));
      setProject(updatedProject);
      closeEditProject();
      setNotice("Project updated.");
    } catch {
      setNotice("This browser could not save the project. Try a smaller cover image.");
    }
  }

  function addManualSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !sourceContent.trim()) return;
    if (!window.confirm("Add this copied text to the project sources?")) return;
    const content = sourceContent.trim().slice(0, 120_000);
    const record: ProjectSourceRecord = {
      id: createSourceId("manual"),
      projectId,
      title: sourceTitleFromContent(content),
      kind: "Pasted text",
      detail: `${content.length.toLocaleString()} characters`,
      content,
      origin: "manual",
      selected: true,
      createdAt: new Date().toISOString(),
    };
    if (persistSources([record, ...sources])) {
      setSourceContent("");
      setSourceModalOpen(false);
      setSourceModalMode("options");
      setNotice("Source saved to this project and available in Studio.");
    }
  }

  function persistSources(next: ProjectSourceRecord[]) {
    try {
      writeProjectSources(projectId, next);
      setSources(next);
      return true;
    } catch {
      setNotice("Project source storage is full in this browser. Remove or shorten a source and try again.");
      return false;
    }
  }

  function mergeSourceRecords(records: ProjectSourceRecord[], message?: string) {
    const current = readProjectSources(projectId);
    const incomingUrls = new Set(records.map((record) => record.url).filter(Boolean));
    const next = [...records, ...current.filter((source) => !source.url || !incomingUrls.has(source.url))];
    if (persistSources(next)) {
      window.dispatchEvent(new CustomEvent("deepcast-project-sources-updated", { detail: { projectId } }));
      if (message) setNotice(message);
      return true;
    }
    return false;
  }

  async function requestResearch(payload: Record<string, unknown>) {
    const response = await fetch("/api/projects/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null) as ResearchResponse | null;
    if (!response.ok) throw new Error(result?.error || `Research request failed (${response.status}).`);
    return result || {};
  }

  function addSourceRecords(records: ProjectSourceRecord[], message: string) {
    mergeSourceRecords(records, message);
  }

  async function runWebResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = researchQuery.trim();
    if (!query || researching) return;
    if (!window.confirm(`Start ${researchMode === "deep" ? "Deep" : researchMode === "balanced" ? "Balanced" : "Fast"} Research and add its results to this project?`)) return;
    setResearching(true);
    const job = beginBackgroundJob(
      `${researchMode === "deep" ? "Deep" : researchMode === "balanced" ? "Balanced" : "Fast"} Research`,
      "Preparing grounded research…",
      projectId,
    );
    setNotice(researchMode === "deep" ? "Building a reusable Deep Research document…" : researchMode === "balanced" ? "Running Balanced Research with grounded web sources…" : "Running Fast Research for new sources…");
    try {
      const result = await requestResearch({ action: `${researchMode}-search`, query });
      job.update("Research response received. Saving project sources…", 45);
      const document = result.document?.trim();
      if (!document) throw new Error("Research did not return readable source material.");
      const createdAt = new Date().toISOString();
      if (researchMode === "deep") {
        const referenceList = (result.references || []).map((item) => `- ${item.title}: ${item.url}`).join("\n");
        const content = `${document}${referenceList ? `\n\nREFERENCES\n${referenceList}` : ""}`.slice(0, 120_000);
        addSourceRecords([{
          id: createSourceId("deep-research"),
          projectId,
          title: `Deep Research — ${query}`.slice(0, 100),
          kind: "Deep Research document",
          detail: `${(result.references || []).length} web references`,
          content,
          origin: "deep-research",
          selected: true,
          createdAt,
        }], "Deep Research complete. The generated research document was saved to this project.");
      } else {
        const references = result.references || [];
        const modeLabel = researchMode === "balanced" ? "Balanced Research" : "Fast Research";
        const usableReferences = references.filter((reference) => !reference.url.includes("vertexaisearch.cloud.google.com"));
        const records: ProjectSourceRecord[] = [];
        for (let index = 0; index < usableReferences.length; index += 1) {
          const reference = usableReferences[index];
          job.update(`Reading source ${index + 1} of ${usableReferences.length}…`, 45 + Math.round(((index + 1) / Math.max(1, usableReferences.length)) * 45));
          setNotice(`Reading research source ${index + 1} of ${usableReferences.length}…`);
          try {
            const page = await requestResearch({ action: "website", url: reference.url });
            if (!page.content || !page.url) throw new Error("No readable page content.");
            const record: ProjectSourceRecord = {
              id: createSourceId("web"),
              projectId,
              title: (page.title || reference.title).slice(0, 100),
              siteName: page.siteName,
              kind: `${modeLabel} web source`,
              detail: page.url,
              content: page.content.slice(0, 120_000),
              overview: page.overview,
              overviewTopics: page.topics || [],
              origin: "web",
              url: page.url,
              selected: true,
              createdAt,
            };
            records.push(record);
            mergeSourceRecords([record], `${records.length} ${modeLabel} source${records.length === 1 ? "" : "s"} added. Research is still running…`);
          } catch {
            const record: ProjectSourceRecord = {
              id: createSourceId("web"),
              projectId,
              title: reference.title.slice(0, 100),
              kind: `${modeLabel} web source`,
              detail: reference.url,
              content: document.slice(0, 120_000),
              origin: "web",
              url: reference.url,
              selected: true,
              createdAt,
            };
            records.push(record);
            mergeSourceRecords([record], `${records.length} ${modeLabel} source${records.length === 1 ? "" : "s"} added. Research is still running…`);
          }
        }
        if (!records.length) records.push({
          id: createSourceId("web"),
          projectId,
          title: `${modeLabel} — ${query}`.slice(0, 100),
          kind: `${modeLabel} brief`,
          detail: "Grounded web research",
          content: document.slice(0, 120_000),
          origin: "web",
          selected: true,
          createdAt,
        });
        if (!usableReferences.length) addSourceRecords(records, `${records.length} ${modeLabel} ${records.length === 1 ? "source was" : "sources were"} added to this project.`);
        else setNotice(`${records.length} ${modeLabel} ${records.length === 1 ? "source was" : "sources were"} added to this project.`);
      }
      setResearchQuery("");
      setSourceModalOpen(false);
      setSourceModalMode("options");
      job.succeed("Research finished and saved to the project.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web research failed. Try again.";
      setNotice(message);
      job.fail(message);
    } finally {
      setResearching(false);
    }
  }

  async function addWebsiteSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = websiteUrls
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const urls = [...new Set(entries.filter((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }))];
    const invalidCount = entries.length - urls.length;
    if (!urls.length || researching) {
      if (entries.length) setNotice("Enter at least one complete URL beginning with http:// or https://.");
      return;
    }
    if (!window.confirm(`Add ${urls.length} ${urls.length === 1 ? "link" : "links"} to this project?`)) return;
    enqueueSourceImport(projectId, urls);
    setWebsiteUrls("");
    setSourceModalOpen(false);
    setSourceModalMode("options");
    setNotice(`${urls.length} link${urls.length === 1 ? "" : "s"} queued.${invalidCount ? ` ${invalidCount} invalid ${invalidCount === 1 ? "entry was" : "entries were"} skipped.` : ""}`);
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The file could not be read."));
      reader.onerror = () => reject(new Error("The file could not be read."));
      reader.readAsDataURL(file);
    });
  }

  async function addUploadedFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 5);
    event.target.value = "";
    if (!files.length || uploading) return;
    if (!window.confirm(`Add ${files.length} selected ${files.length === 1 ? "file" : "files"} to this project?`)) return;
    setUploading(true);
    setNotice(`Importing ${files.length} ${files.length === 1 ? "file" : "files"}…`);
    const records: ProjectSourceRecord[] = [];
    try {
      for (const file of files) {
        if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} is larger than the 12 MB upload limit.`);
        const lowerName = file.name.toLowerCase();
        const localText = file.type.startsWith("text/") || /\.(txt|md|csv|json|xml|html?)$/.test(lowerName);
        let content = "";
        if (localText) content = (await file.text()).trim();
        else {
          const dataUrl = await readFileAsDataUrl(file);
          const result = await requestResearch({ action: "extract-file", fileName: file.name, mimeType: file.type || "application/octet-stream", fileData: dataUrl.split(",")[1] || "" });
          content = result.content?.trim() || "";
        }
        if (!content) throw new Error(`${file.name} did not contain readable source material.`);
        records.push({
          id: createSourceId("upload"), projectId,
          title: file.name.slice(0, 100),
          kind: "Uploaded file",
          detail: `${Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB`,
          content: content.slice(0, 120_000),
          origin: "upload",
          selected: true,
          createdAt: new Date().toISOString(),
        });
      }
      addSourceRecords(records, `${records.length} uploaded ${records.length === 1 ? "file was" : "files were"} added to this project.`);
      setSourceModalOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The selected files could not be added.");
    } finally {
      setUploading(false);
    }
  }

  function toggleSourceSelection(sourceId: string) {
    persistSources(sources.map((source) => source.id === sourceId ? { ...source, selected: source.selected === false } : source));
  }

  function selectAllSources(selected: boolean) {
    persistSources(sources.map((source) => ({ ...source, selected })));
  }

  async function generateSourceOverview() {
    if (!activeSource || overviewLoading) return;
    setOverviewLoading(true);
    setNotice(`Generating an AI overview for ${activeSource.title}…`);
    try {
      const result = await requestResearch({ action: "overview", title: activeSource.title, source: activeSource.content, url: activeSource.url || "" });
      if (!result.overview) throw new Error("The overview did not return readable content.");
      const next = sources.map((source) => source.id === activeSource.id ? { ...source, overview: result.overview, overviewTopics: result.topics || [] } : source);
      if (persistSources(next)) setNotice("AI source overview generated and saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The source overview could not be generated.");
    } finally {
      setOverviewLoading(false);
    }
  }

  function removeSource(sourceId: string) {
    const selected = sources.find((source) => source.id === sourceId);
    if (!window.confirm(`Remove “${selected?.title || "this source"}” from the project? This cannot be undone.`)) return;
    const next = sources.filter((source) => source.id !== sourceId);
    if (persistSources(next)) {
      if (activeSourceId === sourceId) setActiveSourceId("");
      setNotice("Source removed from this project.");
    }
  }

  function toggleDeleteSource(sourceId: string) {
    setDeleteSourceIds((current) => current.includes(sourceId)
      ? current.filter((id) => id !== sourceId)
      : [...current, sourceId]);
  }

  function deleteSelectedSources() {
    if (!deleteSourceIds.length) return;
    const count = deleteSourceIds.length;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? "source" : "sources"} from this project? This cannot be undone.`)) return;
    const ids = new Set(deleteSourceIds);
    const next = sources.filter((source) => !ids.has(source.id));
    if (persistSources(next)) {
      if (activeSourceId && ids.has(activeSourceId)) setActiveSourceId("");
      setDeleteSourceIds([]);
      setDeletingSources(false);
      setNotice(`${count} ${count === 1 ? "source" : "sources"} deleted.`);
    }
  }

  if (!loaded) {
    return <main className="site-shell project-workspace-page"><div className="project-workspace-loading" role="status">LOADING PROJECT…</div></main>;
  }

  if (!project) {
    return <main className="site-shell project-workspace-page"><div className="project-not-found glass-section"><span>PROJECT WORKSPACE</span><h1>PROJECT NOT FOUND</h1><p>This project is not stored in this browser.</p><Link href="/projects">RETURN TO PROJECTS</Link></div></main>;
  }

  return (
    <main className="site-shell project-workspace-page">
      <div className="page-container project-workspace-container">
        <ProjectWorkspaceHeader project={project} active={activeTab} sourceCount={sources.length} onEdit={activeTab === "overview" ? openEditProject : undefined} onTabChange={chooseTab} />

        {activeTab === "overview" && (
          <section className="project-overview-panel glass-section" aria-labelledby="project-overview-title">
            <span>ABOUT THIS PROJECT</span>
            <h2 id="project-overview-title">{project.title}</h2>
            <p>{project.description || "Use this project to keep episode sources, research context, Studio sessions, and related conversations together."}</p>
            <button type="button" className="project-edit-details" onClick={openEditProject}>✎ EDIT PROJECT DETAILS</button>
            <div className="project-overview-stats">
              <article><span>GROUNDED SOURCES</span><strong>{sources.length}</strong><small>{selectedSources.length} active in context</small></article>
              <article><span>AUDIO DEEP DIVES</span><strong>{deepDives.length}</strong><small>{audioReadyCount} audio ready</small></article>
              <article><span>INTELLIGENCE MODEL</span><strong>GEMINI</strong><small>Search grounded</small></article>
              <article><span>HOSTS ASSIGNED</span><strong>JIRO &amp; SHARPAY</strong><small>Saved studio voices</small></article>
            </div>
            <div className="project-workspace-launchers">
              <button type="button" onClick={() => chooseTab("sources")}><i>▤</i><strong>MANAGE SOURCES &amp; WEB SEARCH</strong><span>Crawl links, upload files, or run grounded web research.</span></button>
              <Link href={`/studio?project=${encodeURIComponent(projectId)}`}><i>◉</i><strong>DEEPCAST STUDIO</strong><span>Synthesize multi-host entertainment audio.</span></Link>
              <Link href={`/chat?project=${encodeURIComponent(projectId)}`}><i>▢</i><strong>RESEARCH CHAT ASSISTANT</strong><span>Ask questions using this project&apos;s selected sources.</span></Link>
            </div>
          </section>
        )}

        {activeTab === "sources" && (
          <section className="project-sources-panel glass-section" aria-labelledby="project-sources-title">
            <div className="project-sources-heading">
              <div><span>PROJECT CONTEXT</span><h2 id="project-sources-title">SOURCES</h2><p>Sources saved here are reusable across Deep Dives created inside {project.title}.</p></div>
              <button type="button" onClick={() => { setSourceModalMode("options"); setSourceModalOpen(true); }}>＋ ADD SOURCES</button>
            </div>

            <form className="project-web-research" onSubmit={runWebResearch} aria-label="Search the web for new project sources">
              <label htmlFor="project-research-query">SEARCH THE WEB FOR NEW SOURCES</label>
              <div className="project-web-research-row">
                <span aria-hidden="true">⌕</span>
                <input id="project-research-query" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Search artists, releases, industry stories, or pop culture topics…" maxLength={500} />
                <select value={researchMode} onChange={(event) => setResearchMode(event.target.value as ResearchMode)} aria-label="Research depth"><option value="balanced">BALANCED · DEFAULT</option><option value="fast">FAST RESEARCH</option><option value="deep">DEEP RESEARCH</option></select>
                <button type="submit" disabled={!researchQuery.trim() || researching}>{researching ? "WORKING…" : "SEARCH"}</button>
              </div>
              <p>{researchMode === "deep" ? "Deep Research creates and saves a reusable research document when complete." : researchMode === "balanced" ? "Balanced Research is the default mix of speed, context, and reliable grounded sources." : "Fast Research finds and adds relevant web sources to this project."}</p>
            </form>

            <div className="project-source-toolbar">
              <div><strong>{sources.length} {sources.length === 1 ? "SOURCE" : "SOURCES"}</strong><span>{selectedSources.length} selected</span></div>
              <div className="project-source-bulk-actions">
                {deletingSources ? <>
                  <button type="button" onClick={() => setDeleteSourceIds(deleteSourceIds.length === sources.length ? [] : sources.map((source) => source.id))}>{deleteSourceIds.length === sources.length ? "CLEAR SELECTION" : "SELECT ALL"}</button>
                  <button type="button" className="danger" disabled={!deleteSourceIds.length} onClick={deleteSelectedSources}>DELETE SELECTED{deleteSourceIds.length ? ` (${deleteSourceIds.length})` : ""}</button>
                  <button type="button" onClick={() => { setDeletingSources(false); setDeleteSourceIds([]); }}>CANCEL</button>
                </> : <>
                  <label><input type="checkbox" checked={sources.length > 0 && selectedSources.length === sources.length} onChange={(event) => selectAllSources(event.target.checked)} disabled={!sources.length} /><span aria-hidden="true">{sources.length > 0 && selectedSources.length === sources.length ? "✓" : ""}</span> SELECT ALL</label>
                  <button type="button" disabled={!sources.length} onClick={() => setDeletingSources(true)}>MANAGE SOURCES</button>
                </>}
              </div>
            </div>
            <div className="project-source-records">
              {sources.length ? sources.map((source) => (
                <article key={source.id}>
                  <label className="source-select-control" aria-label={`${deletingSources ? "Mark for deletion" : "Select"} ${source.title}`}><input type="checkbox" checked={deletingSources ? deleteSourceIds.includes(source.id) : source.selected !== false} onChange={() => deletingSources ? toggleDeleteSource(source.id) : toggleSourceSelection(source.id)} /><span aria-hidden="true">{(deletingSources ? deleteSourceIds.includes(source.id) : source.selected !== false) ? "✓" : ""}</span></label>
                  <button type="button" className="source-open-button" onClick={() => setActiveSourceId(source.id)}>
                    <span className="source-record-icon" aria-hidden="true">{source.origin === "google-drive" ? "▣" : source.origin === "web" || source.origin === "website" ? "◎" : source.origin === "deep-research" ? "✦" : source.origin === "upload" ? "⇧" : "¶"}</span>
                    <span><strong>{sourceDisplayTitle(source)}</strong><small>{source.kind} · <b>{source.url || source.detail}</b></small><p>{sourceBrief(source)}</p></span>
                  </button>
                  {!deletingSources && <button type="button" onClick={() => removeSource(source.id)} aria-label={`Remove ${source.title}`}>×</button>}
                </article>
              )) : (
                <div className="project-source-empty"><strong>NO PROJECT SOURCES YET</strong><p>Use Balanced, Fast, or Deep Research above, or add files, websites, Drive documents, and copied text.</p><div><button type="button" onClick={() => { setSourceModalMode("options"); setSourceModalOpen(true); }}>ADD THE FIRST SOURCE</button></div></div>
              )}
            </div>
          </section>
        )}
      </div>

      {notice && <ActionToast message={notice} onDismiss={() => setNotice("")} />}
      {editModalOpen && (
        <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditProject(); }}>
          <section className="new-project-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
            <div className="new-project-modal-heading">
              <div><span>PROJECT OVERVIEW</span><h2 id="edit-project-title">EDIT PROJECT</h2><p>Update this project&apos;s title, purpose, or responsive header artwork.</p></div>
              <button type="button" className="modal-close" onClick={closeEditProject} aria-label="Close edit project">×</button>
            </div>
            <form className="new-project-form" onSubmit={saveProjectEdits}>
              <label htmlFor="edit-project-name">PROJECT TITLE <em>Required</em></label>
              <input id="edit-project-name" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="e.g. Pop Culture Research" maxLength={90} autoFocus required />
              <label htmlFor="edit-project-description">DESCRIPTION OR PROJECT DIRECTION <em>Optional</em></label>
              <textarea id="edit-project-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="What is this project for? Add its focus, audience, or creative direction." maxLength={500} />
              <div className="project-photo-field">
                <div><strong>AUTOMATIC HEADER ART</strong><span>Choose from four original, crop-safe covers. One is assigned automatically when no custom photo is uploaded.</span></div>
                <div className="auto-cover-grid">
                  {AUTO_COVER_OPTIONS.map((cover) => (
                    <button type="button" key={cover.id} className={editCoverImage === cover.src ? "selected" : ""} onClick={() => { setEditCoverImage(cover.src); setEditCoverName(cover.label); }}>
                      <img src={cover.src} alt="" /><span>{cover.label}</span>
                    </button>
                  ))}
                </div>
                <div><strong>CUSTOM HEADER PHOTO</strong><span>JPG, PNG, or WebP · up to 2 MB</span></div>
                <label className="photo-upload"><span aria-hidden="true">＋</span> UPLOAD CUSTOM PHOTO<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleEditProjectPhoto} /></label>
                {editCoverImage && <div className="project-photo-preview"><img src={editCoverImage} alt="Project cover preview" /><div><strong>{editCoverName || "Project cover"}</strong></div></div>}
              </div>
              <div className="new-project-actions"><button type="button" className="modal-cancel" onClick={closeEditProject}>CANCEL</button><button type="submit" className="modal-create" disabled={!editTitle.trim()}>SAVE CHANGES</button></div>
            </form>
          </section>
        </div>
      )}
      {sourceModalOpen && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceModalOpen(false); }}><section className="new-project-modal source-editor-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="add-source-title"><div className="new-project-modal-heading"><div><span>PROJECT SOURCES</span><h2 id="add-source-title">{sourceModalMode === "options" ? "ADD SOURCES" : sourceModalMode === "search" ? "SEARCH THE WEB" : sourceModalMode === "website" ? "WEBSITE AND YOUTUBE URLS" : "COPIED TEXT"}</h2><p>{sourceModalMode === "options" ? "Choose how to add reusable source context to this project." : sourceModalMode === "search" ? "Balanced is the default; use Fast for speed or Deep for a reusable research document." : sourceModalMode === "website" ? "Paste Website and public YouTube URLs below to add them as separate project sources." : "Paste copied source material directly into this project."}</p></div><button type="button" className="modal-close" onClick={() => setSourceModalOpen(false)} aria-label="Close add sources">×</button></div>{sourceModalMode === "options" ? <div className="approved-source-options source-option-menu"><button type="button" onClick={() => setSourceModalMode("search")}><span aria-hidden="true">⌕</span><div><strong>SEARCH THE WEB</strong><small>Balanced, Fast, or Deep Research.</small></div><i aria-hidden="true">›</i></button><label><span aria-hidden="true">⇧</span><div><strong>{uploading ? "UPLOADING FILES…" : "UPLOAD FILES"}</strong><small>PDF, images, text, data, and supported audio files · up to 12 MB each.</small></div><i aria-hidden="true">›</i><input type="file" multiple accept=".pdf,.txt,.md,.csv,.json,.xml,.html,image/*,audio/*" onChange={addUploadedFiles} disabled={uploading} /></label><button type="button" onClick={() => setSourceModalMode("website")}><span aria-hidden="true">↗</span><div><strong>WEBSITE AND YOUTUBE URLS</strong><small>Add one or multiple public links.</small></div><i aria-hidden="true">›</i></button><Link href={`/studio?project=${encodeURIComponent(projectId)}#project-sources`}><span aria-hidden="true">▣</span><div><strong>GOOGLE DRIVE</strong><small>Open Studio to select a supported Drive file.</small></div><i aria-hidden="true">›</i></Link><button type="button" onClick={() => setSourceModalMode("paste")}><span aria-hidden="true">¶</span><div><strong>COPIED TEXT</strong><small>Paste notes, research, a transcript, or other source text.</small></div><i aria-hidden="true">›</i></button><div className="new-project-actions"><button type="button" className="modal-cancel" onClick={() => setSourceModalOpen(false)}>CANCEL</button></div></div> : sourceModalMode === "search" ? <form className="new-project-form modal-research-form" onSubmit={runWebResearch}><label htmlFor="modal-research-query">WEB RESEARCH QUESTION <em>Required</em></label><textarea id="modal-research-query" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Search the web for new sources…" maxLength={500} autoFocus required /><label htmlFor="modal-research-mode">RESEARCH MODE</label><select id="modal-research-mode" value={researchMode} onChange={(event) => setResearchMode(event.target.value as ResearchMode)}><option value="balanced">BALANCED — Default mix of speed and depth</option><option value="fast">FAST RESEARCH — Find and add web sources</option><option value="deep">DEEP RESEARCH — Create a reusable research document</option></select><div className="new-project-actions"><button type="button" className="modal-cancel" onClick={() => setSourceModalMode("options")}>BACK</button><button type="submit" className="modal-create" disabled={!researchQuery.trim() || researching}>{researching ? "RESEARCHING…" : researchMode === "deep" ? "START DEEP RESEARCH" : researchMode === "balanced" ? "START BALANCED RESEARCH" : "START FAST RESEARCH"}</button></div></form> : sourceModalMode === "website" ? <form className="new-project-form website-urls-form" onSubmit={addWebsiteSource}><label htmlFor="website-urls">WEBSITE AND YOUTUBE URLS <em>Required</em></label><textarea id="website-urls" value={websiteUrls} onChange={(event) => setWebsiteUrls(event.target.value)} placeholder={"Paste any links\n\nhttps://example.com/article\nhttps://youtube.com/watch?v=…"} autoFocus required /><ul className="website-url-notes"><li>Separate URLs with spaces, commas, or new lines.</li><li>Paste as many public links as you need; they are safely queued one at a time.</li><li>Each valid readable link is saved as a separate project source.</li></ul><div className="new-project-actions"><button type="button" className="modal-cancel" onClick={() => setSourceModalMode("options")}>BACK</button><button type="submit" className="modal-create" disabled={!websiteUrls.trim() || researching}>{researching ? "IMPORTING LINKS…" : "INSERT SOURCES"}</button></div></form> : <form className="new-project-form" onSubmit={addManualSource}><label htmlFor="source-content">COPIED TEXT <em>Required</em></label><textarea id="source-content" value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} placeholder="Paste research, notes, a transcript, or other source material." maxLength={120000} autoFocus required /><p className="source-title-note">A display label is created automatically from the first line. No source-name field is required.</p><div className="new-project-actions"><button type="button" className="modal-cancel" onClick={() => setSourceModalMode("options")}>BACK</button><button type="submit" className="modal-create" disabled={!sourceContent.trim()}>SAVE COPIED TEXT</button></div></form>}</section></div>}
      {activeSource && <div className="modal-scrim source-detail-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSourceId(""); }}><section className="source-detail-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="source-detail-title"><div className="source-selector-heading"><div><span>{activeSource.kind.toUpperCase()}</span><h2 id="source-detail-title">{sourceDisplayTitle(activeSource)}</h2>{activeSource.url ? <a className="source-detail-url" href={activeSource.url} target="_blank" rel="noreferrer">{activeSource.url}</a> : <p>{activeSource.detail}</p>}</div><button type="button" onClick={() => setActiveSourceId("")} aria-label="Close source">×</button></div><div className="source-overview-card"><div><span aria-hidden="true">✦</span><strong>SOURCE OVERVIEW</strong></div>{activeSource.overview ? <><p>{activeSource.overview}</p>{activeSource.overviewTopics?.length ? <div className="source-overview-topics">{activeSource.overviewTopics.map((topic) => <span key={topic}>{topic}</span>)}</div> : null}<button type="button" onClick={() => void generateSourceOverview()} disabled={overviewLoading}>{overviewLoading ? "REFRESHING…" : "REFRESH OVERVIEW"}</button></> : <><p>Generate a concise overview of this source, its key claims, usefulness, and limitations.</p><button type="button" onClick={() => void generateSourceOverview()} disabled={overviewLoading}>{overviewLoading ? "GENERATING OVERVIEW…" : "GENERATE OVERVIEW"}</button></>}</div>{activeSource.url && <a className="source-external-link" href={activeSource.url} target="_blank" rel="noreferrer">OPEN ORIGINAL SOURCE ↗</a>}{!activeSource.url && <div className="source-content-reader"><span>SOURCE CONTENT</span><pre>{activeSource.content}</pre></div>}</section></div>}
    </main>
  );
}
