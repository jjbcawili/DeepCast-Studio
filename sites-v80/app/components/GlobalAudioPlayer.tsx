"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readDeepDives, type StoredDeepDive } from "../../lib/deep-dive-storage";
import { readEpisodeAudio } from "../../lib/audio-library";
import { readPlaybackProgress, savePlaybackProgress } from "../../lib/playback-progress";
import EpisodeDownloadMenu from "./EpisodeDownloadMenu";

type TranscriptCue = {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function cleanTranscriptLine(value: string) {
  return value
    .replace(/^\s*(?:[-*]\s*)?/, "")
    .replace(/\[(?:warmly|dryly|mischievously|laughs softly|whispers|laughs|sarcastically)\]\s*/gi, "")
    .trim();
}

function buildTranscriptCues(episode: StoredDeepDive, duration: number): TranscriptCue[] {
  const rawLines = episode.segments.flatMap((segment) => {
    const lines = segment.script
      .replace(/\\n/g, "\n")
      .split(/\n{1,}/)
      .map(cleanTranscriptLine)
      .filter(Boolean);
    return lines.length ? lines : [segment.title];
  });
  const lines = rawLines.map((line, index) => {
    const match = line.match(/^([^:]{1,32}):\s*(.+)$/);
    return {
      id: `${index}-${line.slice(0, 18)}`,
      speaker: match?.[1]?.trim() || (index % 2 === 0 ? "Jiro" : "Sharpay"),
      text: match?.[2]?.trim() || line,
    };
  });
  const totalWeight = Math.max(1, lines.reduce((sum, line) => sum + Math.max(12, line.text.length), 0));
  let cursor = 0;
  return lines.map((line) => {
    const share = Math.max(12, line.text.length) / totalWeight;
    const start = cursor;
    cursor += duration * share;
    return { ...line, start, end: cursor };
  });
}

export default function GlobalAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeCueRef = useRef<HTMLButtonElement | null>(null);
  const lastSavedSecond = useRef(-1);
  const [episode, setEpisode] = useState<StoredDeepDive | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [spatial, setSpatial] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [notice, setNotice] = useState("");
  const remaining = useMemo(() => Math.max(0, duration - currentTime), [currentTime, duration]);
  const cues = useMemo(() => episode ? buildTranscriptCues(episode, duration || episode.runtimeSeconds || 1) : [], [duration, episode]);
  const activeCueIndex = useMemo(() => {
    const index = cues.findIndex((cue) => currentTime >= cue.start && currentTime < cue.end);
    return index < 0 ? Math.max(0, cues.length - 1) : index;
  }, [cues, currentTime]);

  useEffect(() => {
    async function playRequested(event: Event) {
      const id = String((event as CustomEvent<{ id?: string }>).detail?.id || "");
      const nextEpisode = readDeepDives().find((item) => item.id === id) || null;
      if (!nextEpisode) return;
      const blob = await readEpisodeAudio(id).catch(() => null);
      if (!blob && !nextEpisode.remoteAudioUrl) {
        window.dispatchEvent(new CustomEvent("deepcast-player-error", { detail: { message: "This episode record has no saved audio yet. Reopen it in Studio to generate the audio." } }));
        return;
      }
      const saved = readPlaybackProgress(id);
      setEpisode(nextEpisode);
      setExpanded(true);
      setTranscriptOpen(false);
      setCurrentTime(saved?.completed ? 0 : saved?.currentTime || 0);
      setDuration(nextEpisode.runtimeSeconds || saved?.duration || 0);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return blob ? URL.createObjectURL(blob) : nextEpisode.remoteAudioUrl!;
      });
      window.setTimeout(() => {
        const player = audioRef.current;
        if (!player) return;
        if (saved && !saved.completed) player.currentTime = saved.currentTime;
        void player.play().catch(() => undefined);
      }, 30);
    }
    window.addEventListener("deepcast-play-episode", playRequested);
    return () => window.removeEventListener("deepcast-play-episode", playRequested);
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    if (!transcriptOpen || !activeCueRef.current) return;
    activeCueRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeCueIndex, transcriptOpen]);

  function seek(delta: number) {
    const player = audioRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, Math.min(player.duration || duration, player.currentTime + delta));
  }

  function updateTime(nextTime: number, nextDuration: number) {
    setCurrentTime(nextTime);
    const second = Math.floor(nextTime);
    if (!episode || second === lastSavedSecond.current) return;
    lastSavedSecond.current = second;
    savePlaybackProgress(episode.id, nextTime, nextDuration);
  }

  function closePlayer() {
    audioRef.current?.pause();
    setEpisode(null);
    setPlaying(false);
    setExpanded(false);
    setTranscriptOpen(false);
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }

  if (!episode || !audioUrl) return null;

  const cover = episode.coverImage || "/assets/auto-covers/neon-broadcast.png";
  const playerStyle = {
    "--player-cover": `url("${cover.replaceAll('"', '\\"')}")`,
  } as React.CSSProperties;

  return (
    <aside className={`global-audio-player ${expanded ? "expanded" : ""} ${transcriptOpen ? "transcript-mode" : "cover-mode"}`} style={playerStyle} aria-label="DeepCast immersive audio player">
      <audio
        ref={audioRef}
        src={audioUrl}
        volume={volume}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => updateTime(event.currentTarget.currentTime, event.currentTarget.duration || duration)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          const saved = readPlaybackProgress(episode.id);
          if (saved && !saved.completed) event.currentTarget.currentTime = Math.min(saved.currentTime, event.currentTarget.duration - 1);
        }}
        onEnded={(event) => {
          setPlaying(false);
          savePlaybackProgress(episode.id, event.currentTarget.duration, event.currentTarget.duration);
        }}
      />
      {expanded && <button type="button" className="global-player-scrim" onClick={() => setExpanded(false)} aria-label="Minimize player" />}
      <div className="global-player-panel">
        <div className="global-player-ambient" aria-hidden="true" />
        <div className="global-player-drag-handle" aria-hidden="true" />
        {expanded && <button type="button" className="global-player-minimize" onClick={() => setExpanded(false)} aria-label="Minimize player">⌄</button>}
        <button type="button" className="global-player-close" onClick={closePlayer} aria-label="Close player">×</button>

        <div className="global-player-primary">
          <button type="button" className="global-player-cover" onClick={() => setExpanded(true)} aria-label="Open immersive player">
            <img src={cover} alt={`${episode.title} cover art`} />
          </button>
          <div className="global-player-meta"><strong>{episode.title}</strong><span>{episode.projectTitle}</span></div>
        </div>

        {expanded && transcriptOpen && (
          <section className="global-player-transcript" aria-label="Synchronized transcript">
            <div className="global-player-transcript-scroll">
              {cues.map((cue, index) => (
                <button
                  type="button"
                  key={cue.id}
                  ref={index === activeCueIndex ? activeCueRef : null}
                  className={index === activeCueIndex ? "active" : index < activeCueIndex ? "past" : ""}
                  onClick={() => { if (audioRef.current) audioRef.current.currentTime = cue.start; }}
                >
                  <small>{cue.speaker}</small>
                  <span>{cue.text}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="global-player-timeline">
          <span>{formatTime(currentTime)}</span>
          <input type="range" min="0" max={Math.max(1, duration)} step=".1" value={Math.min(currentTime, Math.max(1, duration))} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} aria-label="Scrub audio" />
          <span>-{formatTime(remaining)}</span>
        </div>

        <div className="global-player-controls">
          <button type="button" onClick={() => seek(-10)} aria-label="Back 10 seconds">↶<small>10</small></button>
          <button type="button" className="global-player-play" onClick={() => playing ? audioRef.current?.pause() : void audioRef.current?.play()} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button>
          <button type="button" onClick={() => seek(10)} aria-label="Forward 10 seconds">↷<small>10</small></button>
        </div>

        {expanded && (
          <div className="global-player-volume">
            <span aria-hidden="true">◖</span>
            <input type="range" min="0" max="1" step=".02" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} aria-label="Volume" />
            <span aria-hidden="true">◗</span>
          </div>
        )}

        <div className="global-player-actions">
          <button type="button" className={transcriptOpen ? "active" : ""} onClick={() => { setExpanded(true); setTranscriptOpen((value) => !value); }} aria-pressed={transcriptOpen} aria-label="Toggle synchronized transcript">❞ <span>TRANSCRIPT</span></button>
          <button type="button" className={spatial ? "active" : ""} onClick={() => setSpatial((value) => !value)} aria-pressed={spatial}>◉ <span>SPATIAL MIX {spatial ? "ON" : "OFF"}</span></button>
          <EpisodeDownloadMenu episode={episode} onStatus={setNotice} />
        </div>
        {notice && <div className="global-player-download-status" role="status">{notice}</div>}
      </div>
    </aside>
  );
}
