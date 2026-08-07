"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readDeepDives } from "../../lib/deep-dive-storage";
import {
  readAllProjectSources,
  readProjects,
  writeProjectSources,
  writeProjects,
  type DeepCastProject,
} from "../../lib/project-storage";
import ActionToast from "../components/ActionToast";

type SortOption = "Most Recent" | "Oldest" | "Name A–Z" | "Name Z–A" | "Most Sources" | "Most Deep Dives";
type FilterOption = "All" | "Pinned" | "Has Sources" | "Has Deep Dives" | "Created This Month";
type ViewMode = "Grid" | "List";
type OpenControl = "Sort" | "Filter" | "View" | null;

const sortOptions: SortOption[] = ["Most Recent", "Oldest", "Name A–Z", "Name Z–A", "Most Sources", "Most Deep Dives"];
const filterOptions: FilterOption[] = ["All", "Pinned", "Has Sources", "Has Deep Dives", "Created This Month"];
const pinnedStorageKey = "deepcast-pinned-items-v1";
const projectsViewKey = "deepcast-projects-view-v1";

function projectKey(id: string) {
  return `project:${id}`;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>;
}

function DotsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>;
}

function ViewIcon({ mode }: { mode: ViewMode }) {
  return mode === "Grid"
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="4" height="4" rx=".8" /><rect x="3" y="10" width="4" height="4" rx=".8" /><rect x="3" y="16" width="4" height="4" rx=".8" /><path d="M10 6h11M10 12h11M10 18h11" /></svg>;
}

function ProjectMenu({
  project,
  pinned,
  onAction,
  onClose,
}: {
  project: DeepCastProject;
  pinned: boolean;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const groups = [
    ["Open", "Edit Title", pinned ? "Unpin from Home" : "Pin to Home", "Duplicate Project", "Share"],
    ["Delete"],
  ];

  return (
    <div className="item-dropdown dropdown-surface projects-item-dropdown" role="menu" aria-label={`Actions for ${project.title}`} onClick={(event) => event.stopPropagation()}>
      <div className="item-dropdown-heading"><span>PROJECT</span><strong>{project.title}</strong><button type="button" onClick={onClose} aria-label="Close project menu">×</button></div>
      {groups.map((group, index) => (
        <div className="menu-group" key={index}>
          {group.map((action) => <button role="menuitem" type="button" className={action === "Delete" ? "danger-action" : ""} key={action} onClick={() => onAction(action)}>{action}</button>)}
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<DeepCastProject[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [deepDiveCounts, setDeepDiveCounts] = useState<Record<string, number>>({});
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("Most Recent");
  const [filter, setFilter] = useState<FilterOption>("All");
  const [view, setView] = useState<ViewMode>("Grid");
  const [openControl, setOpenControl] = useState<OpenControl>(null);
  const [openMenuId, setOpenMenuId] = useState("");
  const [notice, setNotice] = useState("");

  function loadProjects() {
    const nextProjects = readProjects();
    const allSources = readAllProjectSources();
    const nextDeepDiveCounts = readDeepDives().reduce<Record<string, number>>((counts, item) => {
      if (item.projectId) counts[item.projectId] = (counts[item.projectId] || 0) + 1;
      return counts;
    }, {});
    setProjects(nextProjects);
    setSourceCounts(Object.fromEntries(nextProjects.map((project) => [project.id, allSources[project.id]?.length || 0])));
    setDeepDiveCounts(nextDeepDiveCounts);
  }

  useEffect(() => {
    const legacyProjectId = new URLSearchParams(window.location.search).get("project");
    if (legacyProjectId) {
      window.location.replace(`/projects/${encodeURIComponent(legacyProjectId)}`);
      return;
    }

    loadProjects();
    try {
      const savedPinned = JSON.parse(window.localStorage.getItem(pinnedStorageKey) || "[]");
      if (Array.isArray(savedPinned)) setPinned(new Set(savedPinned.map(String)));
      const savedView = window.localStorage.getItem(projectsViewKey);
      if (savedView === "Grid" || savedView === "List") setView(savedView);
    } catch { /* Use approved defaults when browser storage is unavailable. */ }

    window.addEventListener("deepcast-projects-updated", loadProjects);
    window.addEventListener("deepcast-project-sources-updated", loadProjects);
    window.addEventListener("storage", loadProjects);
    return () => {
      window.removeEventListener("deepcast-projects-updated", loadProjects);
      window.removeEventListener("deepcast-project-sources-updated", loadProjects);
      window.removeEventListener("storage", loadProjects);
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = projects.filter((project) => {
      const searchable = `${project.title} ${project.description || ""}`.toLowerCase();
      const createdAt = new Date(project.createdAt || 0);
      const now = new Date();
      const matchesFilter =
        filter === "All"
        || (filter === "Pinned" && pinned.has(projectKey(project.id)))
        || (filter === "Has Sources" && (sourceCounts[project.id] || 0) > 0)
        || (filter === "Has Deep Dives" && (deepDiveCounts[project.id] || 0) > 0)
        || (filter === "Created This Month" && createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear());
      return (!query || searchable.includes(query)) && matchesFilter;
    });

    return [...matches].sort((a, b) => {
      if (sort === "Name A–Z") return a.title.localeCompare(b.title);
      if (sort === "Name Z–A") return b.title.localeCompare(a.title);
      if (sort === "Most Sources") return (sourceCounts[b.id] || 0) - (sourceCounts[a.id] || 0);
      if (sort === "Most Deep Dives") return (deepDiveCounts[b.id] || 0) - (deepDiveCounts[a.id] || 0);
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return sort === "Oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [deepDiveCounts, filter, pinned, projects, searchQuery, sort, sourceCounts]);

  function chooseView(next: ViewMode) {
    setView(next);
    try { window.localStorage.setItem(projectsViewKey, next); } catch { /* Preference remains available for this session. */ }
  }

  function togglePin(projectId: string) {
    setPinned((current) => {
      const next = new Set(current);
      const key = projectKey(projectId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { window.localStorage.setItem(pinnedStorageKey, JSON.stringify([...next])); } catch { /* Keep the current-session state. */ }
      return next;
    });
  }

  async function shareProject(project: DeepCastProject) {
    const url = new URL(`/projects/${encodeURIComponent(project.id)}`, window.location.origin).toString();
    if (navigator.share) {
      try { await navigator.share({ title: project.title, url }); return; } catch { /* Fall through to copy. */ }
    }
    await navigator.clipboard.writeText(url);
    setNotice("Project link copied.");
  }

  async function runMenuAction(project: DeepCastProject, action: string) {
    if (action === "Open") window.location.assign(`/projects/${encodeURIComponent(project.id)}`);
    else if (action === "Edit Title") {
      const title = window.prompt("Edit project title", project.title)?.trim();
      if (title) {
        writeProjects(readProjects().map((item) => item.id === project.id ? { ...item, title, updatedAt: new Date().toISOString() } : item));
        setNotice("Project title updated.");
      }
    } else if (action === "Pin to Home" || action === "Unpin from Home") {
      togglePin(project.id);
      setNotice(action === "Pin to Home" ? "Project pinned to Home." : "Project unpinned from Home.");
    } else if (action === "Duplicate Project") {
      const duplicateId = `project-${Date.now()}`;
      const now = new Date().toISOString();
      writeProjects([{ ...project, id: duplicateId, title: `${project.title} Copy`, createdAt: now, updatedAt: now }, ...readProjects()]);
      const copiedSources = (readAllProjectSources()[project.id] || []).map((source, index) => ({ ...source, id: `${source.id}-copy-${index}-${Date.now()}`, projectId: duplicateId, createdAt: now }));
      writeProjectSources(duplicateId, copiedSources);
      setNotice("Project duplicated.");
    } else if (action === "Share") await shareProject(project);
    else if (action === "Delete" && window.confirm(`Delete ${project.title}? This cannot be undone.`)) {
      writeProjects(readProjects().filter((item) => item.id !== project.id));
      writeProjectSources(project.id, []);
      setNotice("Project deleted.");
    }
    setOpenMenuId("");
  }

  return (
    <main className="site-shell projects-library-page">
      <div className="page-container projects-library-container">
        <header className="projects-library-header">
          <div className="projects-library-title">
            <span className="projects-workspace-eyebrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h6l2 2H21v9.5H3z" /></svg>PROJECT WORKSPACE</span>
            <h1 className="asset-heading projects-page-title-art"><img src="/assets/DeepCast_Projects_Title_Transparent_4K.webp" alt="Projects" /></h1>
            <p>Build focused projects for pop culture, stan and gay Twitter, and main pop gurlie energy—then carry the right context straight into Studio.</p>
          </div>
          <Link className="projects-new-project" href="/?create=project">＋ CREATE NEW WORKSPACE</Link>
        </header>

        <section className="projects-toolbar glass-section" aria-label="Search, sort, filter, and view projects">
          <label className="projects-search-control">
            <span><SearchIcon /></span>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search projects by name or topic…" aria-label="Search projects" />
          </label>
          <div className="projects-control-dropdown">
            <button type="button" className="projects-select-control" onClick={() => setOpenControl(openControl === "Sort" ? null : "Sort")} aria-expanded={openControl === "Sort"}><span>SORT:</span><strong>{sort.toUpperCase()}</strong><i>⌄</i></button>
            {openControl === "Sort" && <div className="control-dropdown-panel">{sortOptions.map((option) => <button type="button" className={sort === option ? "selected-option" : ""} key={option} onClick={() => { setSort(option); setOpenControl(null); }}>{option}{sort === option && <span>✓</span>}</button>)}</div>}
          </div>
          <div className="projects-control-dropdown">
            <button type="button" className="projects-select-control" onClick={() => setOpenControl(openControl === "Filter" ? null : "Filter")} aria-expanded={openControl === "Filter"}><span>FILTER:</span><strong>{filter.toUpperCase()}</strong><i>⌄</i></button>
            {openControl === "Filter" && <div className="control-dropdown-panel">{filterOptions.map((option) => <button type="button" className={filter === option ? "selected-option" : ""} key={option} onClick={() => { setFilter(option); setOpenControl(null); }}>{option}{filter === option && <span>✓</span>}</button>)}</div>}
          </div>
          <div className="projects-view-switcher" role="group" aria-label="Project view">
            {(["Grid", "List"] as ViewMode[]).map((mode) => <button type="button" key={mode} className={view === mode ? "active" : ""} aria-label={`${mode} view`} aria-pressed={view === mode} onClick={() => chooseView(mode)}><ViewIcon mode={mode} /></button>)}
          </div>
          <div className="projects-control-dropdown projects-view-dropdown">
            <button type="button" className="projects-select-control" onClick={() => setOpenControl(openControl === "View" ? null : "View")} aria-expanded={openControl === "View"}>
              <span>VIEW:</span><strong>{view.toUpperCase()}</strong><i>⌄</i>
            </button>
            {openControl === "View" && (
              <div className="control-dropdown-panel">
                {(["Grid", "List"] as ViewMode[]).map((mode) => (
                  <button type="button" className={view === mode ? "selected-option" : ""} key={mode} onClick={() => { chooseView(mode); setOpenControl(null); }}>
                    <span className="view-option-icon"><ViewIcon mode={mode} /></span>{mode}{view === mode && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={`project-selector-panel projects-index-panel projects-view-${view.toLowerCase()} ${openMenuId ? "menu-layer-active" : ""}`} aria-labelledby="all-projects-title">
          <div className="projects-index-heading">
            <div><h2 id="all-projects-title">YOUR PROJECTS</h2><p>Manage and organize your research spaces, grounded source documents, and Deep Dives.</p></div>
            <small>{visibleProjects.length} OF {projects.length}</small>
          </div>
          <div className="project-selector-list project-index-grid">
            {visibleProjects.map((project) => (
              <article className={`project-index-card ${project.coverImage ? "has-cover-card" : ""} ${openMenuId === project.id ? "menu-open" : ""}`} key={project.id}>
                <Link className={project.coverImage ? "has-cover" : ""} href={`/projects/${encodeURIComponent(project.id)}`} aria-label={`Open ${project.title}`}>
                  {project.coverImage ? <img src={project.coverImage} alt="" /> : <span className="project-index-placeholder" aria-hidden="true">▣</span>}
                  <div className="project-index-copy">
                    <strong>{project.title}</strong>
                    <p>{project.description || "A grounded AI research project workspace."}</p>
                    <div className="project-index-meta"><small>{sourceCounts[project.id] || 0} Sources</small><small>{deepDiveCounts[project.id] || 0} Deep Dives</small><small>Created {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "here"}</small></div>
                  </div>
                  <i aria-hidden="true">→</i>
                </Link>
                <button type="button" className="more-button project-index-menu-button" aria-label={`More options for ${project.title}`} onClick={() => setOpenMenuId(openMenuId === project.id ? "" : project.id)}><DotsIcon /></button>
                {openMenuId === project.id && <ProjectMenu project={project} pinned={pinned.has(projectKey(project.id))} onAction={(action) => runMenuAction(project, action)} onClose={() => setOpenMenuId("")} />}
              </article>
            ))}
            {!visibleProjects.length && (
              <div className="project-library-empty">
                <strong>{projects.length ? "NO MATCHING PROJECTS" : "NO PROJECTS YET"}</strong>
                <p>{projects.length ? "Try another search term, sort order, or filter." : "Create a workspace to organize sources, Deep Dives, Studio sessions, and project Chat."}</p>
                {!projects.length && <Link href="/?create=project">CREATE YOUR FIRST WORKSPACE</Link>}
              </div>
            )}
          </div>
        </section>
      </div>
      {notice && <ActionToast message={notice} onDismiss={() => setNotice("")} />}
    </main>
  );
}
