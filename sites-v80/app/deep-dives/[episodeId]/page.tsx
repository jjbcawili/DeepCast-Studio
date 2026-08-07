"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readEpisodeAudio, requestEpisodePlayback } from "../../../lib/audio-library";
import { readDeepDives, saveDeepDive, type StoredDeepDive } from "../../../lib/deep-dive-storage";
import EpisodeDownloadMenu from "../../components/EpisodeDownloadMenu";
import ActionToast from "../../components/ActionToast";
import { downloadBlob, renderEpisodeExport } from "../../../lib/audio-export";

function transcriptFor(episode: StoredDeepDive) {
  return episode.segments.map((segment) => `${segment.title}\n${segment.script.replace(/\\n/g, "\n")}`).join("\n\n");
}

export default function EpisodePage() {
  const params = useParams<{ episodeId: string }>();
  const episodeId = decodeURIComponent(params.episodeId);
  const [episode, setEpisode] = useState<StoredDeepDive | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [episodeAudio, setEpisodeAudio] = useState<Blob | null>(null);
  const [notice, setNotice] = useState("");
  const [musicFile, setMusicFile] = useState<{ name: string; url: string } | null>(null);
  const [musicPlacement, setMusicPlacement] = useState<"continuous" | "intro-outro">("continuous");
  const [autoLoop, setAutoLoop] = useState(true);
  const [musicVolume, setMusicVolume] = useState(14);
  const [voiceDucking, setVoiceDucking] = useState(true);
  const [previewUrl, setPreviewUrl] = useState("");
  const [mixing, setMixing] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  useEffect(() => {
    const found = readDeepDives().find((item) => item.id === episodeId) || null;
    setEpisode(found);
    void readEpisodeAudio(episodeId).then((blob) => { setHasAudio(Boolean(blob)); setEpisodeAudio(blob); });
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
          updatedAt: new Date().toISOString(),
        };
        saveDeepDive(updated);
        setEpisode(updated);
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

  function chooseMusic(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { setNotice("Choose a supported audio file."); return; }
    if (musicFile?.url) URL.revokeObjectURL(musicFile.url);
    setMusicFile({ name: file.name, url: URL.createObjectURL(file) });
    setNotice(`${file.name} is ready for the post-production mix.`);
  }

  async function makeMusicMix(download: boolean) {
    if (!episode || !episodeAudio || !musicFile || mixing) return;
    setMixing(true);
    setNotice(download ? "Exporting the music mix…" : "Preparing a preview mix…");
    const voiceUrl = URL.createObjectURL(episodeAudio);
    try {
      const result = await renderEpisodeExport({
        title: episode.title,
        format: "wav",
        spatialOutput: "spatial-stereo",
        segments: [{ id: 1, title: episode.title, audioUrl: voiceUrl }],
        musicEnabled: true,
        musicTracks: [{ id: "episode-music", name: musicFile.name, url: musicFile.url }],
        musicCueMode: "continuous",
        defaultMusicTrackId: "episode-music",
        segmentMusicMap: {},
        musicVolume: voiceDucking ? Math.max(4, Math.round(musicVolume * .72)) : musicVolume,
        autoLoopMusic: autoLoop,
        musicPlacement,
        introOutroBoost: musicPlacement === "intro-outro",
      });
      if (download) {
        downloadBlob(result.blob, result.filename.replace(/\.wav$/i, "-Music-Mix.wav"));
        setNotice("Music mix exported successfully.");
      } else {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(result.blob));
        setNotice("Preview mix is ready.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The music mix could not be created.");
    } finally {
      URL.revokeObjectURL(voiceUrl);
      setMixing(false);
    }
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
        <details className="episode-post-production glass-section">
          <summary><span>EPISODE CONSOLE</span><h2>POST-PRODUCTION MUSIC</h2></summary>
          <div className="episode-music-controls">
            <label className="episode-music-upload">ADD MUSIC<input type="file" accept="audio/*" onChange={(event) => chooseMusic(event.target.files?.[0])} /><span>{musicFile?.name || "UPLOAD OPTIONAL AUDIO"}</span></label>
            <fieldset><legend>PLACEMENT</legend><label><input type="radio" name="music-placement" checked={musicPlacement === "intro-outro"} onChange={() => setMusicPlacement("intro-outro")} /> INTRO / OUTRO</label><label><input type="radio" name="music-placement" checked={musicPlacement === "continuous"} onChange={() => setMusicPlacement("continuous")} /> FULL EPISODE</label></fieldset>
            <label className="episode-music-toggle"><input type="checkbox" checked={autoLoop} onChange={(event) => setAutoLoop(event.target.checked)} /><span /> AUTO LOOP</label>
            <label className="episode-music-range">BACKGROUND VOLUME <b>{musicVolume}%</b><input type="range" min="0" max="45" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} /></label>
            <label className="episode-music-toggle"><input type="checkbox" checked={voiceDucking} onChange={(event) => setVoiceDucking(event.target.checked)} /><span /> VOICE DUCKING</label>
            <div className="episode-music-actions"><button type="button" disabled={!musicFile || !hasAudio || mixing} onClick={() => void makeMusicMix(false)}>{mixing ? "MIXING…" : "PREVIEW MIX"}</button><button type="button" disabled={!musicFile || !hasAudio || mixing} onClick={() => void makeMusicMix(true)}>EXPORT MUSIC MIX</button></div>
            {previewUrl && <audio className="episode-music-preview" controls src={previewUrl} />}
          </div>
        </details>
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
