"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readEpisodeAudio, requestEpisodePlayback } from "../../../lib/audio-library";
import { readDeepDives, type StoredDeepDive } from "../../../lib/deep-dive-storage";
import { readProjects, readProjectSources, type DeepCastProject } from "../../../lib/project-storage";
import ProjectWorkspaceHeader from "../../components/ProjectWorkspaceHeader";

export default function StudioConsolePage() {
  const [episode, setEpisode] = useState<StoredDeepDive | null>(null);
  const [project, setProject] = useState<DeepCastProject | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("episode") || "";
    const found = readDeepDives().find((item) => item.id === id) || null;
    setEpisode(found);
    if (found?.projectId) {
      setProject(readProjects().find((item) => item.id === found.projectId) || null);
      setSourceCount(readProjectSources(found.projectId).length);
    }
    if (found) void readEpisodeAudio(found.id).then((blob) => setHasAudio(Boolean(blob)));
  }, []);

  const transcript = useMemo(() => episode?.segments.map((segment) => `${segment.title}\n${segment.script.replace(/\\n/g, "\n")}`).join("\n\n") || "", [episode]);
  function downloadTranscript() {
    if (!episode || !transcript) return;
    const blob = new Blob([`${episode.title}\n\n${transcript}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${episode.title.replace(/[^a-z0-9]+/gi, "-")}-Transcript.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!episode) return <main className="site-shell"><div className="page-container console-review-page"><Link className="project-workspace-back" href="/deep-dives">← BACK TO DEEP DIVES</Link><div className="library-empty-state glass-section"><strong>STUDIO CONSOLE LOCKED</strong><p>Create an episode before opening its console.</p></div></div></main>;
  return (
    <main className="site-shell">
      <div className="page-container console-review-page">
        {project ? <ProjectWorkspaceHeader project={project} active="console" sourceCount={sourceCount} /> : <Link className="project-workspace-back" href={`/deep-dives/${encodeURIComponent(episode.id)}`}>← BACK TO EPISODE</Link>}
        <section className="console-review-header glass-section"><div><span>STUDIO MASTER CONSOLE</span><h1>{episode.title}</h1><p>{episode.engine || "Gemini TTS"} · {episode.status}</p></div><div><button type="button" disabled={!hasAudio} onClick={() => requestEpisodePlayback(episode.id)}>▶ PLAY</button><Link href={`/deep-dives/${encodeURIComponent(episode.id)}`}>EPISODE PAGE</Link><button type="button" disabled={!transcript} onClick={downloadTranscript}>TXT TRANSCRIPT</button></div></section>
        <section className="console-review-grid">
          <div className="glass-section"><span>SHOW OUTLINE & SEGMENTS</span>{episode.outline.map((item) => <article key={item.number}><b>{String(item.number).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.summary}</p></div></article>)}</div>
          <div className="glass-section"><span>GENERATED LIVE SCRIPT</span>{episode.segments.map((segment) => <article key={segment.id}><strong>{segment.title}</strong><p>{segment.script.replace(/\\n/g, "\n")}</p></article>)}</div>
        </section>
      </div>
    </main>
  );
}
