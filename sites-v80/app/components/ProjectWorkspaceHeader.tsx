"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { automaticCoverFor } from "../../lib/cover-art";
import { readDeepDives, type StoredDeepDive } from "../../lib/deep-dive-storage";
import type { DeepCastProject } from "../../lib/project-storage";

type WorkspaceTab = "overview" | "sources" | "deep-dives" | "studio" | "console" | "chat";

export default function ProjectWorkspaceHeader({ project, active, sourceCount = 0, onEdit, onTabChange }: {
  project: DeepCastProject;
  active: WorkspaceTab;
  sourceCount?: number;
  onEdit?: () => void;
  onTabChange?: (tab: "overview" | "sources") => void;
}) {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<StoredDeepDive[]>([]);
  useEffect(() => {
    const load = () => setEpisodes(readDeepDives().filter((episode) => episode.projectId === project.id));
    load();
    window.addEventListener("deepcast-deep-dives-updated", load);
    return () => window.removeEventListener("deepcast-deep-dives-updated", load);
  }, [project.id]);
  const latestConsoleEpisode = useMemo(() => episodes.find((episode) => episode.outline.length || episode.segments.length), [episodes]);
  const projectPath = `/projects/${encodeURIComponent(project.id)}`;
  useEffect(() => {
    router.prefetch(projectPath);
    router.prefetch(`${projectPath}?tab=sources`);
    router.prefetch(`${projectPath}/deep-dives`);
    router.prefetch(`/studio?project=${encodeURIComponent(project.id)}`);
    router.prefetch(`/chat?project=${encodeURIComponent(project.id)}`);
  }, [project.id, projectPath, router]);
  const cover = project.coverImage || automaticCoverFor(project.id);
  return (
    <div className="project-workspace-header">
      <Link className="project-workspace-back" href="/projects" aria-label="Back to Projects">
        <span aria-hidden="true">←</span>
        <strong>BACK TO PROJECTS</strong>
      </Link>
      <section className="project-cover-hero has-cover" style={{ backgroundImage: `url(${cover})` }}>
        <div className="project-cover-copy"><span>GROUNDED RESEARCH WORKSPACE</span><h1>{project.title}</h1><p>{sourceCount} {sourceCount === 1 ? "SOURCE" : "SOURCES"}</p></div>
        {active === "overview" && onEdit && <button type="button" className="project-cover-change" onClick={onEdit}>▣ CHANGE HEADER PHOTO</button>}
      </section>
      <nav className="project-context-tabs glass-section" aria-label={`${project.title} workspace`}>
        {onTabChange
          ? <button type="button" className={active === "overview" ? "active" : ""} onClick={() => onTabChange("overview")}>OVERVIEW</button>
          : <Link className={active === "overview" ? "active" : ""} href={projectPath}>OVERVIEW</Link>}
        {onTabChange
          ? <button type="button" className={active === "sources" ? "active" : ""} onClick={() => onTabChange("sources")}>SOURCES <span>{sourceCount}</span></button>
          : <Link className={active === "sources" ? "active" : ""} href={`${projectPath}?tab=sources`}>SOURCES <span>{sourceCount}</span></Link>}
        <Link className={active === "deep-dives" ? "active" : ""} href={`${projectPath}/deep-dives`}>DEEP DIVES <span>{episodes.length}</span></Link>
        <Link className={active === "studio" ? "active" : ""} href={`/studio?project=${encodeURIComponent(project.id)}`}>STUDIO</Link>
        {latestConsoleEpisode
          ? <Link className={active === "console" ? "active" : ""} href={`/studio/console?episode=${encodeURIComponent(latestConsoleEpisode.id)}`}>CONSOLE</Link>
          : <span className="project-context-tab-disabled" aria-disabled="true">CONSOLE</span>}
        <Link className={active === "chat" ? "active" : ""} href={`/chat?project=${encodeURIComponent(project.id)}`}>CHAT</Link>
      </nav>
    </div>
  );
}
