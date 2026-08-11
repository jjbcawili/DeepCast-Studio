"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { readAllProjectSources, readProjects, writeProjectSources, writeProjects } from "../lib/project-storage";
import { readDeepDives, writeDeepDives } from "../lib/deep-dive-storage";
import ActionToast from "./components/ActionToast";
import { requestEpisodePlayback } from "../lib/audio-library";

type DeepDiveStatus = "Draft" | "Ready to Generate" | "Generating" | "Audio Ready" | "Failed";
type ViewMode = "Grid" | "List" | "Compact List";
type ItemKind = "project" | "deep-dive";
type ControlName = "Sort" | "Filter";

type Project = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  sources: number;
  deepDives: number;
  updated: string;
  updatedOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type DeepDive = {
  id: string;
  title: string;
  project: string;
  runtime: string;
  date: string;
  updatedOrder: number;
  status: DeepDiveStatus;
  hasTranscript: boolean;
  canRegenerate: boolean;
  topic: string;
  projectId?: string;
};

type OpenMenu = { kind: ItemKind; id: string } | null;

const sortOptions = ["Most Recent", "Oldest", "Name A–Z", "Name Z–A"] as const;
const filterOptions = ["All", "Projects", "Deep Dives", "Draft", "Ready to Generate", "Generating", "Audio Ready", "Failed", "Archived"] as const;
const viewOptions: ViewMode[] = ["Grid", "List", "Compact List"];
const pinnedStorageKey = "deepcast-pinned-items-v1";

function PlayIcon({ pause = false }: { pause?: boolean }) {
  return pause ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
}

function DotsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>;
}

function ViewIcon({ mode }: { mode: ViewMode }) {
  if (mode === "Grid") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
  }
  if (mode === "Compact List") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h14M7 12h14M7 18h14" /><circle cx="3" cy="6" r=".8" /><circle cx="3" cy="12" r=".8" /><circle cx="3" cy="18" r=".8" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="4" height="4" rx=".8" /><rect x="3" y="10" width="4" height="4" rx=".8" /><rect x="3" y="16" width="4" height="4" rx=".8" /><path d="M10 6h11M10 12h11M10 18h11" /></svg>;
}

function itemKey(kind: ItemKind, id: string) {
  return `${kind}:${id}`;
}

function projectMenuGroups(_project: Project, pinned: boolean) {
  return [
    ["Open", "Edit Title", pinned ? "Unpin from Home" : "Pin to Home", "Duplicate Project", "Share"],
    ["Delete"],
  ];
}

function deepDiveMenuGroups(item: DeepDive, pinned: boolean) {
  const pin = pinned ? "Unpin from Home" : "Pin to Home";
  if (item.status === "Draft") return [["Open in Studio", "Rename", "View Focus & Prompt", "View Sources", pin, "Duplicate Deep Dive", "Move to Project", "Share", "Delete"]];
  if (item.status === "Ready to Generate") return [["Open in Studio", "Rename", "View Focus & Prompt", "View Sources", pin, "Duplicate Deep Dive", "Move to Project", "Generate", "Share", "Delete"]];
  if (item.status === "Generating") return [["View Progress", "View Focus & Prompt", "View Sources", pin, "Share"]];
  if (item.status === "Failed") return [["Retry Generation", "Open in Studio", "View Error Details", "Rename", "View Focus & Prompt", "View Sources", pin, "Duplicate Deep Dive", "Delete"]];

  const first = ["Play / Open", "Rename", "View Focus & Prompt", "View Sources"];
  if (item.hasTranscript) first.push("View Transcript");
  first.push(pin);
  const second = ["Duplicate Deep Dive", "Move to Project"];
  if (item.canRegenerate) second.push("Regenerate");
  return [first, second, ["Download", "Share"], ["Delete"]];
}

function AnchoredActionMenu({ title, kind, groups, onAction, onClose }: { title: string; kind: ItemKind; groups: string[][]; onAction: (action: string) => void; onClose: () => void }) {
  return (
    <div className="item-dropdown dropdown-surface" role="menu" aria-label={`Actions for ${title}`} onClick={(event) => event.stopPropagation()}>
      <div className="item-dropdown-heading"><span>{kind === "project" ? "PROJECT" : "DEEP DIVE"}</span><strong>{title}</strong><button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Close menu">×</button></div>
      {groups.map((group, groupIndex) => <div className="menu-group" key={groupIndex}>{group.map((action) => <button role="menuitem" type="button" className={action === "Delete" ? "danger-action" : ""} key={action} onClick={(event) => { event.stopPropagation(); onAction(action); }}>{action}</button>)}</div>)}
    </div>
  );
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<(typeof sortOptions)[number]>("Most Recent");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]>("All");
  const [view, setView] = useState<ViewMode>("Grid");
  const [playing, setPlaying] = useState<string | null>(null);
  const [pinned, setPinned] = useState(() => new Set<string>());
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [openControl, setOpenControl] = useState<ControlName | null>(null);
  const [notice, setNotice] = useState("");
  const [customProjects, setCustomProjects] = useState<Project[]>([]);
  const [deepDives, setDeepDives] = useState<DeepDive[]>([]);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectPhoto, setNewProjectPhoto] = useState<string | null>(null);
  const [newProjectPhotoName, setNewProjectPhotoName] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const sourcesByProject = readAllProjectSources();
        const storedDeepDives = readDeepDives();
        const deepDiveCounts = storedDeepDives.reduce<Record<string, number>>((counts, item) => {
          if (item.projectId) counts[item.projectId] = (counts[item.projectId] || 0) + 1;
          return counts;
        }, {});
        const availableProjects = readProjects().map((project, index) => ({
          ...project,
          sources: sourcesByProject[project.id]?.length || 0,
          deepDives: deepDiveCounts[project.id] || 0,
          updated: project.updatedAt ? `Updated ${new Date(project.updatedAt).toLocaleDateString()}` : "Created in this browser",
          updatedOrder: project.updatedAt ? new Date(project.updatedAt).getTime() : index,
        }));
        setCustomProjects(availableProjects);
        setSourceTotal(Object.values(sourcesByProject).reduce((total, sources) => total + sources.length, 0));
        setDeepDives(storedDeepDives.map((item) => ({
          id: item.id,
          title: item.title,
          project: item.projectTitle,
          runtime: item.targetLength === "flexible" ? "Flexible" : `${item.targetLength} min`,
          date: new Date(item.updatedAt).toLocaleDateString(),
          updatedOrder: new Date(item.updatedAt).getTime(),
          status: item.status,
          hasTranscript: item.segments.length > 0,
          canRegenerate: true,
          topic: item.topic,
          projectId: item.projectId,
        })));
        const savedPinned = JSON.parse(window.localStorage.getItem(pinnedStorageKey) || "[]");
        if (Array.isArray(savedPinned)) setPinned(new Set(savedPinned.map(String)));
        if (new URLSearchParams(window.location.search).get("create") === "project") setNewProjectOpen(true);
      } catch {
        setCustomProjects([]);
        setDeepDives([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const projectList = useMemo(() => customProjects, [customProjects]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    const matches = projectList.filter((project) => {
      const searchMatch = !normalizedQuery || project.title.toLowerCase().includes(normalizedQuery);
      const filterMatch = filter === "All" || filter === "Projects";
      return searchMatch && filterMatch;
    });
    return [...matches].sort((a, b) => {
      if (sort === "Most Recent") return b.updatedOrder - a.updatedOrder;
      if (sort === "Oldest") return a.updatedOrder - b.updatedOrder;
      return sort === "Name A–Z" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
    });
  }, [filter, normalizedQuery, projectList, sort]);

  const filteredDeepDives = useMemo(() => {
    const matches = deepDives.filter((item) => {
      const searchMatch = !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery) || item.project.toLowerCase().includes(normalizedQuery);
      const filterMatch = filter === "All" || filter === "Deep Dives" || filter === item.status;
      return searchMatch && filterMatch;
    });
    return [...matches].sort((a, b) => {
      if (sort === "Most Recent") return b.updatedOrder - a.updatedOrder;
      if (sort === "Oldest") return a.updatedOrder - b.updatedOrder;
      return sort === "Name A–Z" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
    });
  }, [deepDives, filter, normalizedQuery, sort]);

  const pinnedItems = useMemo(() => {
    const items: Array<{ key: string; kind: ItemKind; title: string; meta: string; status?: string }> = [];
    projectList.forEach((project) => {
      const key = itemKey("project", project.id);
      if (pinned.has(key)) items.push({ key, kind: "project", title: project.title, meta: `${project.sources} Sources · ${project.deepDives} Deep Dives` });
    });
    deepDives.forEach((item) => {
      const key = itemKey("deep-dive", item.id);
      if (pinned.has(key)) items.push({ key, kind: "deep-dive", title: item.title, meta: item.project, status: item.status });
    });
    return items;
  }, [deepDives, pinned, projectList]);

  function togglePin(kind: ItemKind, id: string) {
    const key = itemKey(kind, id);
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(pinnedStorageKey, JSON.stringify([...next]));
      return next;
    });
  }

  function openDestination(path: string) {
    window.location.assign(path);
  }

  async function shareItem(title: string, path: string) {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* User cancelled or sharing is unavailable. */ }
    }
    await navigator.clipboard.writeText(url);
    setNotice("Share link copied.");
  }

  function downloadTranscript(id: string) {
    const item = readDeepDives().find((entry) => entry.id === id);
    if (!item?.segments.length) {
      setNotice("This Deep Dive does not have a transcript yet.");
      return;
    }
    const transcript = [`# ${item.title}`, "", `Focus: ${item.topic}`, "", ...item.segments.flatMap((segment) => [`## ${segment.title}`, "", segment.script, ""])].join("\n");
    const url = URL.createObjectURL(new Blob([transcript], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "deep-dive"}-transcript.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Transcript downloaded.");
  }

  async function runMenuAction(action: string) {
    if (!openMenu) return;
    const { kind, id } = openMenu;
    const project = projectList.find((entry) => entry.id === id);
    const dive = deepDives.find((entry) => entry.id === id);
    if (action === "Pin to Home" || action === "Unpin from Home") togglePin(kind, id);
    else if (action === "Open" || action === "Play / Open" || action === "View Progress" || action === "View Error Details") openDestination(kind === "project" ? `/projects/${encodeURIComponent(id)}` : `/deep-dives?episode=${encodeURIComponent(id)}`);
    else if (action === "Open in Studio" || action === "Generate" || action === "Regenerate" || action === "Retry Generation") openDestination(`/studio?${new URLSearchParams({ ...(dive?.projectId ? { project: dive.projectId } : {}), ...(dive?.topic ? { topic: dive.topic } : {}) })}`);
    else if (action === "View Focus & Prompt") openDestination(`/deep-dives?episode=${encodeURIComponent(id)}#focus`);
    else if (action === "View Transcript") openDestination(`/deep-dives?episode=${encodeURIComponent(id)}#transcript`);
    else if (action === "View Sources") {
      if (dive?.projectId) openDestination(`/projects/${encodeURIComponent(dive.projectId)}?tab=sources`);
      else setNotice("This independent Deep Dive has no project sources.");
    } else if (action === "Edit Title" && project) {
      const title = window.prompt("Edit project title", project.title)?.trim();
      if (title) {
        const now = new Date().toISOString();
        const next = readProjects().map((entry) => entry.id === id ? { ...entry, title, updatedAt: now } : entry);
        writeProjects(next);
        setCustomProjects((current) => current.map((entry) => entry.id === id ? { ...entry, title, updated: "Updated just now", updatedOrder: Date.now(), updatedAt: now } : entry));
        setNotice("Project title updated.");
      }
    } else if (action === "Rename" && dive) {
      const title = window.prompt("Rename Deep Dive", dive.title)?.trim();
      if (title) {
        writeDeepDives(readDeepDives().map((entry) => entry.id === id ? { ...entry, title, updatedAt: new Date().toISOString() } : entry));
        setDeepDives((current) => current.map((entry) => entry.id === id ? { ...entry, title, updatedOrder: Date.now() } : entry));
        setNotice("Deep Dive renamed.");
      }
    } else if (action === "Duplicate Project" && project) {
      const duplicateId = `project-${Date.now()}`;
      const now = new Date().toISOString();
      writeProjects([{ ...project, id: duplicateId, title: `${project.title} Copy`, createdAt: now, updatedAt: now }, ...readProjects()]);
      const sourceCopies = (readAllProjectSources()[id] || []).map((source, index) => ({ ...source, id: `${source.id}-copy-${index}-${Date.now()}`, projectId: duplicateId, createdAt: now }));
      writeProjectSources(duplicateId, sourceCopies);
      window.location.reload();
    } else if (action === "Duplicate Deep Dive" && dive) {
      const original = readDeepDives().find((entry) => entry.id === id);
      if (original) {
        const now = new Date().toISOString();
        writeDeepDives([{ ...original, id: `deep-dive-${Date.now()}`, title: `${original.title} Copy`, status: "Draft", createdAt: now, updatedAt: now }, ...readDeepDives()]);
        window.location.reload();
      }
    } else if (action === "Move to Project" && dive) {
      const choices = projectList;
      const answer = window.prompt(`Move to which project?\n${choices.map((entry, index) => `${index + 1}. ${entry.title}`).join("\n")}`);
      const selected = choices[Number(answer) - 1];
      if (selected) {
        writeDeepDives(readDeepDives().map((entry) => entry.id === id ? { ...entry, projectId: selected.id, projectTitle: selected.title, updatedAt: new Date().toISOString() } : entry));
        setDeepDives((current) => current.map((entry) => entry.id === id ? { ...entry, projectId: selected.id, project: selected.title, updatedOrder: Date.now() } : entry));
        setNotice(`Moved to ${selected.title}.`);
      }
    } else if (action === "Download") downloadTranscript(id);
    else if (action === "Share") await shareItem(project?.title || dive?.title || "DeepCast", kind === "project" ? `/projects/${encodeURIComponent(id)}` : `/deep-dives?episode=${encodeURIComponent(id)}`);
    else if (action === "Delete") {
      const title = project?.title || dive?.title || "this item";
      if (window.confirm(`Delete ${title}? This cannot be undone.`)) {
        if (kind === "project") {
          writeProjects(readProjects().filter((entry) => entry.id !== id));
          writeProjectSources(id, []);
          setCustomProjects((current) => current.filter((entry) => entry.id !== id));
        } else {
          writeDeepDives(readDeepDives().filter((entry) => entry.id !== id));
          setDeepDives((current) => current.filter((entry) => entry.id !== id));
        }
        setNotice(`${kind === "project" ? "Project" : "Deep Dive"} deleted.`);
      }
    }
    setOpenMenu(null);
  }

  const hideProjects = ["Deep Dives", "Ready to Generate", "Generating", "Audio Ready", "Failed"].includes(filter);
  const hideDeepDives = filter === "Projects";
  const cardViewClass = view.toLowerCase().replaceAll(" ", "-");

  function selectControlOption(option: string) {
    if (openControl === "Sort") setSort(option as (typeof sortOptions)[number]);
    if (openControl === "Filter") setFilter(option as (typeof filterOptions)[number]);
    setOpenControl(null);
  }

  function closeNewProjectModal() {
    setNewProjectOpen(false);
    setNewProjectTitle("");
    setNewProjectDescription("");
    setNewProjectPhoto(null);
    setNewProjectPhotoName("");
  }

  function handleProjectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file for the project cover.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Choose a project cover smaller than 2 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewProjectPhoto(typeof reader.result === "string" ? reader.result : null);
      setNewProjectPhotoName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newProjectTitle.trim();
    if (!title) return;
    if (!window.confirm(`Create the project “${title}”?`)) return;
    const createdProject: Project = {
      id: `project-${Date.now()}`,
      title,
      description: newProjectDescription.trim() || undefined,
      coverImage: newProjectPhoto || undefined,
      sources: 0,
      deepDives: 0,
      updated: "Updated just now",
      updatedOrder: Math.max(...projectList.map((project) => project.updatedOrder), 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCustomProjects((current) => {
      const next = [createdProject, ...current];
      try { writeProjects(next); } catch { /* Surface storage limitations through the existing project UI. */ }
      return next;
    });
    closeNewProjectModal();
    setNotice(`Project created: ${title}`);
  }

  return (
    <main className="site-shell">
      <div className="page-container home-container">
        <section className="approved-hero" aria-labelledby="hero-title">
          <div className="approved-hero-title">
            <h1 id="hero-title">CREATE A</h1>
            <div className="deep-dive-art" role="img" aria-label="Deep Dive">
              <img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="" />
            </div>
            <p>Generate a high-quality, multi-host audio podcast discussing your favorite entertainment topics, music industry drama, or iconic pop culture moments.</p>
          </div>
        </section>

        <section className="studio-session-card glass-wrapper" aria-labelledby="studio-session-title">
          <div>
            <h2 id="studio-session-title">START YOUR STUDIO SESSION</h2>
            <p>Configure your hosts, sources, and format for entertainment-first episodes covering music industry drama, main pop girlies, pop culture, gay and stan Twitter, and the Khia Asylum girlies.</p>
          </div>
          <Link href="/studio" className="open-studio-button"><PlayIcon /> OPEN STUDIO</Link>
        </section>

        <section className="dashboard-toolbar glass-wrapper" aria-label="Search, sort, filter, and view controls">
          <label className="search-control">
            <span aria-hidden="true"><SearchIcon /></span>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search projects and Deep Dives..." />
          </label>
          <div className="toolbar-selects">
            {(["Sort", "Filter"] as const).map((control) => {
              const value = control === "Sort" ? sort : filter;
              const options = control === "Sort" ? sortOptions : filterOptions;
              return <div className="control-dropdown dropdown-surface" key={control}><button type="button" className="select-control" onClick={() => setOpenControl(openControl === control ? null : control)} aria-haspopup="menu" aria-expanded={openControl === control}><span>{control.toUpperCase()}</span><strong>{value}</strong><i aria-hidden="true">⌄</i></button>{openControl === control && <div className="control-dropdown-panel" role="menu" aria-label={`${control} options`}>{options.map((option) => <button role="menuitemradio" aria-checked={value === option} type="button" className={value === option ? "selected-option" : ""} key={option} onClick={() => selectControlOption(option)}>{option}<span aria-hidden="true">{value === option ? "✓" : ""}</span></button>)}</div>}</div>;
            })}
            <div className="view-switcher" role="group" aria-label="View options">
              {viewOptions.map((option) => <button type="button" key={option} className={view === option ? "active" : ""} onClick={() => setView(option)} aria-pressed={view === option} aria-label={`${option} view`} title={`${option} view`}><ViewIcon mode={option} /></button>)}
            </div>
          </div>
          {filter !== "All" && <div className="filter-chips" aria-label="Active filters"><button type="button" onClick={() => setFilter("All")}>{filter}<span aria-hidden="true">×</span></button><button type="button" className="clear-all" onClick={() => setFilter("All")}>Clear All</button></div>}
        </section>

        {pinnedItems.length > 0 && (
          <section className="dashboard-section glass-section pinned-section" aria-labelledby="pinned-title">
            <div className="section-heading asset-section-heading"><h2 id="pinned-title" className="asset-heading pinned-title-art"><img src="/assets/DeepCast_Pinned_Title_Transparent_4K.webp" alt="Pinned" /></h2>{pinnedItems.length > 6 && <Link href="/projects?view=pinned" className="section-link">View All Pinned</Link>}</div>
            <div className="pinned-grid">
              {pinnedItems.slice(0, 6).map((item) => (
                <article key={item.key} className="pinned-card" onClick={() => { const [, id] = item.key.split(":"); openDestination(item.kind === "project" ? `/projects/${encodeURIComponent(id)}` : `/deep-dives/${encodeURIComponent(id)}`); }}>
                  <span className="item-kind">{item.kind === "project" ? "PROJECT" : "DEEP DIVE"}</span>
                  <button type="button" className="unpin-button" aria-label={`Unpin ${item.title} from Home`} onClick={(event) => { event.stopPropagation(); const [kind, id] = item.key.split(":") as [ItemKind, string]; togglePin(kind, id); }}>×</button>
                  <h3>{item.title}</h3><p>{item.meta}</p>{item.status && <span className={`small-status status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>}
                </article>
              ))}
            </div>
          </section>
        )}

        {!hideProjects && (
          <section className={`dashboard-section glass-section projects-section ${openMenu?.kind === "project" ? "menu-layer-active" : ""}`} aria-labelledby="projects-title">
            <div className="section-heading asset-section-heading">
              <h2 id="projects-title" className="asset-heading projects-title-art"><Link href="/projects" aria-label="Open Projects"><img src="/assets/DeepCast_Projects_Title_Transparent_4K.webp" alt="Projects" /></Link></h2>
              <button type="button" className="new-project" onClick={() => setNewProjectOpen(true)}>⊕ New Project</button>
            </div>
            {filteredProjects.length ? (
              <div className={`project-grid ${cardViewClass}`}>
                {filteredProjects.map((project) => (
                  <article className={`project-card ${openMenu?.kind === "project" && openMenu.id === project.id ? "menu-open" : ""}`} key={project.id} role="link" tabIndex={0} onClick={() => openDestination(`/projects/${encodeURIComponent(project.id)}`)} onKeyDown={(event) => { if (event.key === "Enter") openDestination(`/projects/${encodeURIComponent(project.id)}`); }}>
                    <button type="button" className="more-button card-menu-button" aria-label={`More options for ${project.title}`} onClick={(event) => { event.stopPropagation(); setOpenMenu({ kind: "project", id: project.id }); }}><DotsIcon /></button>
                    {openMenu?.kind === "project" && openMenu.id === project.id && <AnchoredActionMenu title={project.title} kind="project" groups={projectMenuGroups(project, pinned.has(itemKey("project", project.id)))} onAction={runMenuAction} onClose={() => setOpenMenu(null)} />}
                    <h3>{project.title}</h3>
                    <p>{project.sources} Sources · {project.deepDives} Deep Dives</p>
                    <div className="project-footer"><span>{project.updated}</span></div>
                  </article>
                ))}
              </div>
            ) : <div className="empty-state functional-empty-state"><strong>{projectList.length ? "NO MATCHING PROJECTS" : "NO PROJECTS YET"}</strong><p>{projectList.length ? "Try another search or filter." : "Create your first project to organize sources and Deep Dives."}</p>{!projectList.length && <button type="button" onClick={() => setNewProjectOpen(true)}>CREATE A PROJECT</button>}</div>}
          </section>
        )}

        {!hideDeepDives && (
          <section className={`dashboard-section glass-section deep-dives-section ${openMenu?.kind === "deep-dive" ? "menu-layer-active" : ""}`} aria-labelledby="deep-dives-title">
            <div className="section-heading asset-section-heading"><h2 id="deep-dives-title" className="asset-heading deep-dives-title-art"><Link href="/deep-dives" aria-label="Open Deep Dives"><img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dives" /></Link></h2></div>
            {filteredDeepDives.length ? (
              <div className={`episode-list ${cardViewClass}`}>
                {filteredDeepDives.map((item) => (
                  <article className={`episode-row ${openMenu?.kind === "deep-dive" && openMenu.id === item.id ? "menu-open" : ""}`} key={item.id} role="link" tabIndex={0} onClick={() => openDestination(`/deep-dives/${encodeURIComponent(item.id)}`)} onKeyDown={(event) => { if (event.key === "Enter") openDestination(`/deep-dives/${encodeURIComponent(item.id)}`); }}>
                    <button className="play-button" type="button" aria-label={`Play ${item.title}`} disabled={item.status !== "Audio Ready"} onClick={(event) => { event.stopPropagation(); if (item.status === "Audio Ready") { setPlaying(item.title); requestEpisodePlayback(item.id); } }}><PlayIcon pause={playing === item.title} /></button>
                    <div className="episode-info"><strong>{item.title}</strong><span>{item.project}</span></div>
                    <span className="runtime"><strong>{item.runtime}</strong><small>{item.date}</small></span>
                    <span className={`status-pill status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>
                    <button className="more-button" type="button" aria-label={`More options for ${item.title}`} onClick={(event) => { event.stopPropagation(); setOpenMenu({ kind: "deep-dive", id: item.id }); }}><DotsIcon /></button>
                    {openMenu?.kind === "deep-dive" && openMenu.id === item.id && <AnchoredActionMenu title={item.title} kind="deep-dive" groups={deepDiveMenuGroups(item, pinned.has(itemKey("deep-dive", item.id)))} onAction={runMenuAction} onClose={() => setOpenMenu(null)} />}
                  </article>
                ))}
              </div>
            ) : <div className="empty-state functional-empty-state"><strong>{deepDives.length ? "NO MATCHING DEEP DIVES" : "NO DEEP DIVES YET"}</strong><p>{deepDives.length ? "Try another search or filter." : "Generate an episode in Studio and it will appear here automatically."}</p>{!deepDives.length && <Link href="/studio">OPEN STUDIO</Link>}</div>}
          </section>
        )}

        <section className="workspace-card glass-section" aria-labelledby="workspace-title">
          <h2 id="workspace-title" className="asset-heading workspace-title-art"><img src="/assets/DeepCast_Workspace_Title_Transparent_4K.webp" alt="Workspace" /></h2>
          <div className="workspace-stats"><div><span>Projects</span><strong>{projectList.length}</strong></div><div><span>Deep Dives</span><strong>{deepDives.length}</strong></div><div><span>Sources</span><strong>{sourceTotal}</strong></div><div><span>Audio Ready</span><strong className="accent-number">{deepDives.filter((item) => item.status === "Audio Ready").length}</strong></div></div>
        </section>
      </div>

      {notice && <ActionToast message={notice} onDismiss={() => setNotice("")} />}
      {playing && <aside className="mini-player" aria-label="Now playing"><button type="button" onClick={() => setPlaying(null)} aria-label="Pause"><PlayIcon pause /></button><div><small>NOW PLAYING</small><strong>{playing}</strong></div><div className="mini-progress"><span /></div><span>00:18</span><button className="close-player" type="button" onClick={() => setPlaying(null)} aria-label="Close player">×</button></aside>}
      {newProjectOpen && (
        <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeNewProjectModal(); }}>
          <section className="new-project-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
            <div className="new-project-modal-heading">
              <div><span>PROJECTS</span><h2 id="new-project-title">Create a Project</h2><p>Set up a home for the sources, Deep Dives, and creative direction that belong together.</p></div>
              <button type="button" className="modal-close" onClick={closeNewProjectModal} aria-label="Close create project">×</button>
            </div>
            <form className="new-project-form" onSubmit={createProject}>
              <label htmlFor="new-project-name">Project title <em>Required</em></label>
              <input id="new-project-name" value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} placeholder="e.g. Main Pop Girl Archive" autoFocus required maxLength={90} />
              <label htmlFor="new-project-description">Description or project direction <em>Optional</em></label>
              <textarea id="new-project-description" value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="What is this project for? Add the perspective, tone, artists, or areas you want to keep together." maxLength={500} />
              <div className="project-photo-field">
                <div><strong>Project cover</strong><span>Optional · JPG, PNG, or WebP · up to 2 MB</span></div>
                {newProjectPhoto ? <div className="project-photo-preview"><img src={newProjectPhoto} alt="Selected project cover" /><div><strong>{newProjectPhotoName}</strong><button type="button" onClick={() => { setNewProjectPhoto(null); setNewProjectPhotoName(""); }}>Remove photo</button></div></div> : <label className="photo-upload" htmlFor="new-project-photo"><span aria-hidden="true">＋</span> Add project photo<input id="new-project-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleProjectPhoto} /></label>}
              </div>
              <div className="new-project-actions"><button type="button" className="modal-cancel" onClick={closeNewProjectModal}>Cancel</button><button type="submit" className="modal-create" disabled={!newProjectTitle.trim()}>Create Project</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
