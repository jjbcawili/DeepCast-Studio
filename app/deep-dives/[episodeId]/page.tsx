"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readEpisodeAudio, requestEpisodePlayback } from "../../../lib/audio-library";
import { readDeepDives, saveDeepDive, type StoredDeepDive } from "../../../lib/deep-dive-storage";
import EpisodeDownloadMenu from "../../components/EpisodeDownloadMenu";
import ActionToast from "../../components/ActionToast";

function transcriptFor(episode: StoredDeepDive) {
  return episode.segments.map((segment) => `${segment.title}\n${segment.script.replace(/\\n/g, "\n")}`).join("\n\n");
}

export default function EpisodePage() {
  const params = useParams<{ episodeId: string }>();
  const episodeId = decodeURIComponent(params.episodeId);
  const [episode, setEpisode] = useState<StoredDeepDive | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState<number | null>(null);

  useEffect(() => {
    const found = readDeepDives().find((item) => item.id === episodeId) || null;
    setEpisode(found);
    void readEpisodeAudio(episodeId).then((blob) => setHasAudio(Boolean(blob || found?.remoteAudioUrl)));
  }, [episodeId]);

  useEffect(() => {
    if (!episode?.backgroundJobId || episode.status === "Audio Ready") return;
    let stopped = false;
    let timer = 0;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/background/jobs/${encodeURIComponent(episode.backgroundJobId!)}`, { cache: "no-store" });
        const snapshot = await response.json() as any;
        if (!response.ok) throw new Error(snapshot?.error || `Generation status failed (${response.status}).`);
        if (stopped) return;
        const nextStatus = snapshot.status === "complete" ? "Audio Ready" : snapshot.status === "partial" ? "Partial" : snapshot.status === "failed" || snapshot.status === "cancelled" ? "Failed" : snapshot.progress > 0 ? "Generating" : "Submitted";
        const remoteAudioUrl = snapshot.status === "complete"
          ? `/api/background/jobs/${encodeURIComponent(episode.backgroundJobId!)}/segments/1/audio`
          : episode.remoteAudioUrl;
        const updated: StoredDeepDive = {
          ...episode,
          title: snapshot.script?.title || snapshot.title || episode.title,
          summary: snapshot.script?.summary || episode.summary,
          outline: snapshot.script?.outline || episode.outline,
          segments: snapshot.script?.segments || episode.segments,
          status: nextStatus,
          progress: Math.max(0, Math.min(100, Math.round(snapshot.progress || 0))),
          generationStage: snapshot.stage || episode.generationStage,
          generationError: snapshot.error || undefined,
          backgroundSegments: Array.isArray(snapshot.segments) ? snapshot.segments : undefined,
          remoteAudioUrl,
          updatedAt: new Date().toISOString(),
        };
        saveDeepDive(updated);
        setEpisode(updated);
        if (remoteAudioUrl) setHasAudio(true);
        if (!["complete", "partial", "failed", "cancelled"].includes(snapshot.status)) timer = window.setTimeout(refresh, 3000);
      } catch (error) {
        if (!stopped) {
          const message = error instanceof Error ? error.message : "Generation status could not be refreshed.";
          setNotice(message);
          timer = window.setTimeout(refresh, 8000);
        }
      }
    };
    void refresh();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [episode?.backgroundJobId, episode?.status]);

  async function retrySection(segmentId: number) {
    if (!episode?.backgroundJobId || retrying !== null) return;
    setRetrying(segmentId);
    try {
      const response = await fetch(`/api/background/jobs/${encodeURIComponent(episode.backgroundJobId)}/segments/${segmentId}/retry`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Section retry could not be queued.");
      const updated = { ...episode, status: "Generating" as const, generationStage: `Retrying section ${segmentId}`, generationError: undefined, updatedAt: new Date().toISOString() };
      saveDeepDive(updated); setEpisode(updated); setNotice(`Section ${segmentId} was queued for retry.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Section retry failed."); }
    finally { setRetrying(null); }
  }

  async function retryFailedEpisode() {
    if (!episode?.backgroundJobId || episode.status !== "Failed" || retrying !== null) return;
    setRetrying(-1);
    try {
      const response = await fetch(`/api/background/jobs/${encodeURIComponent(episode.backgroundJobId)}/segments/1/retry`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Episode retry could not be queued.");
      const updated = { ...episode, status: "Generating" as const, generationStage: "Retry accepted. Resuming only the failed generation stage…", generationError: undefined, updatedAt: new Date().toISOString() };
      saveDeepDive(updated);
      setEpisode(updated);
      setNotice("Retry queued. Completed script and audio work were preserved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Episode retry failed.");
    } finally {
      setRetrying(null);
    }
  }

  const transcript = useMemo(() => episode ? transcriptFor(episode) : "", [episode]);

  function downloadTranscript() {
    if (!episode || !transcript) return;
    const blob = new Blob([`${episode.title}\n${episode.projectTitle}\n\n${transcript}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${episode.title.replace(/[^a-z0-9]+/gi, "-") || "DeepCast-Episode"}-Transcript.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!episode) return <main className="site-shell"><div className="page-container episode-detail-page"><Link className="project-workspace-back" href="/deep-dives">← BACK TO DEEP DIVES</Link><section className="glass-section library-empty-state"><strong>EPISODE NOT FOUND</strong><p>This episode is not available in this browser’s saved library.</p></section></div></main>;

  return (
    <main className="site-shell">
      <div className="page-container episode-detail-page">
        <Link className="project-workspace-back" href="/deep-dives">← BACK TO DEEP DIVES</Link>
        <section className="episode-detail-hero glass-section">
          {episode.coverImage && <img src={episode.coverImage} alt="" />}
          <div>
            <span>DEEPCAST EPISODE</span>
            <h1>{episode.title}</h1>
            <p>{episode.projectTitle} · {new Date(episode.createdAt).toLocaleDateString()} · {episode.runtimeSeconds ? `${Math.floor(episode.runtimeSeconds / 60)}:${String(Math.round(episode.runtimeSeconds % 60)).padStart(2, "0")}` : episode.targetLength}</p>
            <div className={`episode-generation-state status-${episode.status.toLowerCase().replaceAll(" ", "-")}`}>
              <strong>{episode.status.toUpperCase()}</strong>
              <span>{episode.generationStage || (episode.status === "Audio Ready" ? "Episode audio is ready." : "Waiting for generation status…")}</span>
              {episode.status !== "Audio Ready" && <progress max="100" value={episode.progress || 0}>{episode.progress || 0}%</progress>}
              {episode.generationError && <p>{episode.generationError}</p>}
            </div>
            <div className="episode-detail-actions">
              {episode.status === "Failed" && episode.backgroundJobId ? <button type="button" className="episode-retry-button" disabled={retrying !== null} onClick={() => void retryFailedEpisode()}>{retrying === -1 ? "QUEUING RETRY…" : "↻ RETRY FAILED GENERATION"}</button> : null}
              <button type="button" disabled={!hasAudio} onClick={() => requestEpisodePlayback(episode.id)}>▶ PLAY EPISODE</button>
              <Link href={`/studio/console?episode=${encodeURIComponent(episode.id)}`}>OPEN STUDIO CONSOLE</Link>
              <Link href={episode.projectId
                ? `/studio?project=${encodeURIComponent(episode.projectId)}&episode=${encodeURIComponent(episode.id)}`
                : `/studio?episode=${encodeURIComponent(episode.id)}`}>REOPEN IN STUDIO</Link>
              <EpisodeDownloadMenu episode={episode} disabled={!hasAudio} onStatus={setNotice} />
              <button type="button" disabled={!transcript} onClick={downloadTranscript}>TXT TRANSCRIPT</button>
            </div>
          </div>
        </section>
        <details className="episode-detail-summary glass-section" open>
          <summary><span>EPISODE SUMMARY</span><h2>OVERVIEW</h2></summary>
          <p>{episode.summary || episode.topic}</p>
        </details>
        <details className="episode-detail-transcript glass-section" open>
          <summary><span>TIME-SYNCED SCRIPT</span><h2>TRANSCRIPT</h2></summary>
          <div className="episode-transcript-sections">{episode.segments.map((segment) => { const generation = episode.backgroundSegments?.find((item) => item.id === segment.id); return <details className="episode-transcript-segment" key={segment.id}><summary>{String(segment.id).padStart(2, "0")} · {segment.title} {generation?.status ? `· ${generation.status.toUpperCase()}` : ""}</summary><p>{segment.script.replace(/\\n/g, "\n")}</p>{generation?.error && <p className="episode-segment-error">{generation.error}</p>}{generation?.status === "failed" ? <button type="button" disabled={retrying !== null} onClick={() => void retrySection(segment.id)}>{retrying === segment.id ? "QUEUING…" : "RETRY THIS SECTION"}</button> : null}</details>; })}</div>
        </details>
      </div>
      {notice && <ActionToast message={notice} onDismiss={() => setNotice("")} />}
    </main>
  );
}
