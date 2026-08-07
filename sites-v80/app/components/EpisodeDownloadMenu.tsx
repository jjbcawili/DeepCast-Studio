"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob, transcodeSavedEpisode, type ExportFormat } from "../../lib/audio-export";
import { readEpisodeAudio } from "../../lib/audio-library";
import type { StoredDeepDive } from "../../lib/deep-dive-storage";

export default function EpisodeDownloadMenu({ episode, disabled = false, compact = false, onStatus }: {
  episode: StoredDeepDive;
  disabled?: boolean;
  compact?: boolean;
  onStatus?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<ExportFormat | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  async function download(format: ExportFormat) {
    setWorking(format);
    onStatus?.(`Preparing ${format === "m4a" ? "M4A 256 kbps" : format === "mp3" ? "MP3 320 kbps" : "WAV 48 kHz"}…`);
    try {
      const original = await readEpisodeAudio(episode.id);
      if (!original) throw new Error("No saved audio is available for this episode.");
      if (format === "wav") {
        downloadBlob(original, `${episode.title.replace(/[^a-z0-9]+/gi, "-") || "DeepCast-Episode"}-Spatial-Stereo.wav`);
      } else {
        const converted = await transcodeSavedEpisode(original, episode.title, format);
        downloadBlob(converted.blob, converted.filename);
      }
      onStatus?.(`${format.toUpperCase()} download is ready.`);
      setOpen(false);
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : "The audio download could not be prepared.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div ref={rootRef} className={`episode-download-menu ${compact ? "compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="episode-download-trigger" disabled={disabled || Boolean(working)} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        ⇩ {!compact && <span>{working ? "PREPARING…" : "DOWNLOAD AUDIO"}</span>}
      </button>
      {open && (
        <>
          <button type="button" className="episode-download-scrim" onClick={() => setOpen(false)} aria-label="Close download formats" />
          <div className="episode-download-options" role="menu">
            <strong>DOWNLOAD FORMAT</strong>
            <button type="button" onClick={() => void download("wav")} disabled={Boolean(working)}><span>WAV</span><small>48 kHz lossless · Spatial Stereo</small></button>
            <button type="button" onClick={() => void download("m4a")} disabled={Boolean(working)}><span>M4A</span><small>256 kbps · Spatial Stereo</small></button>
            <button type="button" onClick={() => void download("mp3")} disabled={Boolean(working)}><span>MP3</span><small>320 kbps · Spatial Stereo</small></button>
          </div>
        </>
      )}
    </div>
  );
}
