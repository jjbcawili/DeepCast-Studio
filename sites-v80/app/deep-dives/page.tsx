"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { requestEpisodePlayback } from "../../lib/audio-library";
import { readDeepDives, type StoredDeepDive, type StoredDeepDiveStatus } from "../../lib/deep-dive-storage";
import { readAllPlaybackProgress, type EpisodePlaybackProgress } from "../../lib/playback-progress";
import ActionToast from "../components/ActionToast";
import EpisodeDownloadMenu from "../components/EpisodeDownloadMenu";

type SortOption = "Most Recent" | "Oldest" | "Title A–Z" | "Title Z–A" | "Runtime Longest" | "Runtime Shortest";
type FilterOption = "All" | StoredDeepDiveStatus;
type ViewMode = "Grid" | "List" | "Compact List";

const sorts: SortOption[] = ["Most Recent", "Oldest", "Title A–Z", "Title Z–A", "Runtime Longest", "Runtime Shortest"];
const filters: FilterOption[] = ["All", "Audio Ready", "Draft", "Ready to Generate", "Generating", "Failed"];
const views: ViewMode[] = ["Grid", "List", "Compact List"];

function formatRuntime(item: StoredDeepDive) {
  if (item.runtimeSeconds) {
    const minutes = Math.floor(item.runtimeSeconds / 60);
    const seconds = Math.round(item.runtimeSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  return item.targetLength === "flexible" ? "Flexible runtime" : `${item.targetLength} min target`;
}

export default function DeepDivesPage() {
  const [items, setItems] = useState<StoredDeepDive[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("Most Recent");
  const [filter, setFilter] = useState<FilterOption>("All");
  const [view, setView] = useState<ViewMode>("Grid");
  const [openControl, setOpenControl] = useState<"sort" | "filter" | "view" | null>(null);
  const [notice, setNotice] = useState("");
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, EpisodePlaybackProgress>>({});

  useEffect(() => {
    function load() {
      const stored = readDeepDives();
      setItems(stored);
      setPlaybackProgress(readAllPlaybackProgress());
    }
    const timer = window.setTimeout(load, 0);
    window.addEventListener("deepcast-deep-dives-updated", load);
    window.addEventListener("deepcast-playback-progress", load);
    window.addEventListener("deepcast-player-error", ((event: CustomEvent<{ message?: string }>) => setNotice(event.detail?.message || "This episode does not have saved audio yet.")) as EventListener);
    try {
      const saved = window.localStorage.getItem("deepcast-deep-dives-view-v1");
      if (views.includes(saved as ViewMode)) setView(saved as ViewMode);
    } catch { /* Use responsive default. */ }
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("deepcast-deep-dives-updated", load);
      window.removeEventListener("deepcast-playback-progress", load);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items
      .filter((item) => (!normalized || `${item.title} ${item.projectTitle} ${item.topic}`.toLowerCase().includes(normalized)) && (filter === "All" || item.status === filter))
      .sort((a, b) => {
        if (sort === "Title A–Z") return a.title.localeCompare(b.title);
        if (sort === "Title Z–A") return b.title.localeCompare(a.title);
        if (sort === "Runtime Longest") return (b.runtimeSeconds || Number(b.targetLength) * 60 || 0) - (a.runtimeSeconds || Number(a.targetLength) * 60 || 0);
        if (sort === "Runtime Shortest") return (a.runtimeSeconds || Number(a.targetLength) * 60 || 0) - (b.runtimeSeconds || Number(b.targetLength) * 60 || 0);
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sort === "Oldest" ? aTime - bTime : bTime - aTime;
      });
  }, [filter, items, query, sort]);

  function chooseView(next: ViewMode) {
    setView(next);
    try { window.localStorage.setItem("deepcast-deep-dives-view-v1", next); } catch { /* Keep session preference. */ }
    setOpenControl(null);
  }

  function selectEpisode(id: string) {
    window.location.href = `/deep-dives/${encodeURIComponent(id)}`;
  }

  return (
    <main className="site-shell deep-dive-library-page">
      <div className="page-container deep-dive-library-container">
        <header className="deep-dive-library-header">
          <span>YOUR AUDIO LIBRARY</span>
          <h1 className="asset-heading deep-dives-page-title-art"><img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.webp" alt="Deep Dives" /></h1>
          <p>Search, play, download, and revisit every Deep Dive and podcast episode created in your space.</p>
        </header>

        <section className="deep-dive-studio-launch glass-section">
          <div><span>CREATE A NEW EPISODE</span><strong>OPEN DEEPCAST STUDIO</strong><p>Choose a project, format, runtime, hosts, sources, music, cover art, and output mix.</p></div>
          <Link href="/studio">▶ OPEN STUDIO</Link>
        </section>

        <section className="deep-dive-controls glass-section" aria-label="Search, sort, filter, and view Deep Dives">
          <label className="deep-dive-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Deep Dives, projects, or prompts…" /></label>
          <div className="deep-dive-control">
            <button type="button" onClick={() => setOpenControl(openControl === "sort" ? null : "sort")}><span>SORT:</span><strong>{sort.toUpperCase()}</strong><i>⌄</i></button>
            {openControl === "sort" && <div className="control-dropdown-panel">{sorts.map((option) => <button type="button" key={option} onClick={() => { setSort(option); setOpenControl(null); }}>{option}{sort === option && <span>✓</span>}</button>)}</div>}
          </div>
          <div className="deep-dive-control">
            <button type="button" onClick={() => setOpenControl(openControl === "filter" ? null : "filter")}><span>FILTER:</span><strong>{filter.toUpperCase()}</strong><i>⌄</i></button>
            {openControl === "filter" && <div className="control-dropdown-panel">{filters.map((option) => <button type="button" key={option} onClick={() => { setFilter(option); setOpenControl(null); }}>{option}{filter === option && <span>✓</span>}</button>)}</div>}
          </div>
          <div className="deep-dive-view desktop-deep-dive-view">{views.map((option) => <button type="button" key={option} className={view === option ? "active" : ""} onClick={() => chooseView(option)}>{option === "Grid" ? "▦" : option === "List" ? "☷" : "≡"}<span>{option}</span></button>)}</div>
          <div className="deep-dive-control mobile-deep-dive-view">
            <button type="button" onClick={() => setOpenControl(openControl === "view" ? null : "view")}><span>VIEW:</span><strong>{view.toUpperCase()}</strong><i>⌄</i></button>
            {openControl === "view" && <div className="control-dropdown-panel">{views.map((option) => <button type="button" key={option} onClick={() => chooseView(option)}>{option}{view === option && <span>✓</span>}</button>)}</div>}
          </div>
        </section>

        <section className={`deep-dive-library glass-section deep-dive-view-${view.toLowerCase().replace(" ", "-")}`}>
          <div className="deep-dive-library-heading"><div><span>YOUR DEEP DIVES</span><h2>ALL EPISODES</h2><p>Episode history and listening progress are saved on this device for offline viewing.</p></div><small>{filtered.length} OF {items.length}</small></div>
          {filtered.length ? <div className="deep-dive-library-list">{filtered.map((item) => (
            <article key={item.id}>
              <button type="button" className="deep-dive-library-play" onClick={() => requestEpisodePlayback(item.id)} disabled={item.status !== "Audio Ready"} aria-label={`Play ${item.title}`}>▶</button>
              {item.coverImage && <button type="button" className="deep-dive-cover-button" onClick={() => selectEpisode(item.id)}><img src={item.coverImage} alt="" /></button>}
              <button type="button" className="deep-dive-library-copy" onClick={() => selectEpisode(item.id)}>
                <strong>{item.title}</strong>
                <small><span>{item.projectTitle}</span><span>{formatRuntime(item)}</span><span>Created {new Date(item.createdAt).toLocaleDateString()}</span></small>
                <p>{item.summary || item.outline.slice(0, 2).map((entry) => entry.summary).join(" ") || item.topic}</p>
                <span className="deep-dive-listen-progress" aria-label={`${Math.round(playbackProgress[item.id]?.percent || 0)} percent listened`}>
                  <i style={{ width: `${playbackProgress[item.id]?.percent || 0}%` }} />
                </span>
                <em>{playbackProgress[item.id]?.completed ? "LISTENED" : playbackProgress[item.id]?.percent ? `${Math.round(playbackProgress[item.id].percent)}% LISTENED` : "NOT STARTED"}</em>
              </button>
              <span className={`status-pill status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>
              <EpisodeDownloadMenu episode={item} compact disabled={item.status !== "Audio Ready"} onStatus={setNotice} />
            </article>
          ))}</div> : <div className="library-empty-state"><strong>{items.length ? "NO MATCHING DEEP DIVES" : "YOUR DEEP DIVE LIBRARY IS READY"}</strong><p>{items.length ? "Try another search term, status, or sort order." : "Generate your first episode in Studio. Its script, cover art, and saved audio will appear here."}</p>{!items.length && <Link href="/studio">OPEN STUDIO</Link>}</div>}
        </section>

      </div>
      {notice && <ActionToast message={notice} onDismiss={() => setNotice("")} />}
    </main>
  );
}
