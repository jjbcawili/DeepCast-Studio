"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { requestEpisodePlayback } from "../../../../lib/audio-library";
import { readDeepDives, type StoredDeepDive } from "../../../../lib/deep-dive-storage";
import { readProjects, readProjectSources, type DeepCastProject } from "../../../../lib/project-storage";
import ProjectWorkspaceHeader from "../../../components/ProjectWorkspaceHeader";

export default function ProjectDeepDivesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);
  const [project, setProject] = useState<DeepCastProject | null>(null);
  const [episodes, setEpisodes] = useState<StoredDeepDive[]>([]);
  const [sourceCount, setSourceCount] = useState(0);

  useEffect(() => {
    setProject(readProjects().find((item) => item.id === projectId) || null);
    setEpisodes(readDeepDives().filter((item) => item.projectId === projectId));
    setSourceCount(readProjectSources(projectId).length);
  }, [projectId]);

  if (!project) return null;
  return (
    <main className="site-shell">
      <div className="page-container project-workspace-page">
        <ProjectWorkspaceHeader project={project} active="deep-dives" sourceCount={sourceCount} />
        <section className="project-deep-dives glass-section">
          <div className="section-heading-row"><div><span>PROJECT AUDIO LIBRARY</span><h2>DEEP DIVES</h2><p>Every episode created inside {project.title}.</p></div><Link href={`/studio?project=${encodeURIComponent(project.id)}`}>＋ CREATE EPISODE</Link></div>
          {episodes.length ? <div className="project-deep-dives-list">{episodes.map((episode) => <article key={episode.id}>
            {episode.coverImage && <img src={episode.coverImage} alt="" />}
            <button type="button" onClick={() => requestEpisodePlayback(episode.id)} disabled={episode.status !== "Audio Ready"}>▶</button>
            <Link href={`/deep-dives/${encodeURIComponent(episode.id)}`}><strong>{episode.title}</strong><span>{new Date(episode.createdAt).toLocaleDateString()} · {episode.runtimeSeconds ? `${Math.round(episode.runtimeSeconds / 60)} min` : episode.targetLength}</span><p>{episode.summary || episode.topic}</p></Link>
          </article>)}</div> : <div className="library-empty-state"><strong>NO DEEP DIVES YET</strong><p>Create the first episode for this project in Studio.</p><Link href={`/studio?project=${encodeURIComponent(project.id)}`}>OPEN STUDIO</Link></div>}
        </section>
      </div>
    </main>
  );
}
