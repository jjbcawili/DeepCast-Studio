"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readEpisodeAudio, requestEpisodePlayback } from "../../../lib/audio-library";
import { readDeepDives, type StoredDeepDive } from "../../../lib/deep-dive-storage";
import { downloadBlob, renderEpisodeExport } from "../../../lib/audio-export";
import EpisodeDownloadMenu from "../../components/EpisodeDownloadMenu";
import ActionToast from "../../components/ActionToast";

export default function StudioConsolePage() {
  const [episode, setEpisode] = useState<StoredDeepDive | null>(null);
  const [episodeAudio, setEpisodeAudio] = useState<Blob | null>(null);
  const [notice, setNotice] = useState("");
  const [musicFile, setMusicFile] = useState<{ name:string; url:string } | null>(null);
  const [musicPlacement, setMusicPlacement] = useState<"continuous"|"intro-outro">("continuous");
  const [autoLoop, setAutoLoop] = useState(true);
  const [musicVolume, setMusicVolume] = useState(14);
  const [voiceDucking, setVoiceDucking] = useState(true);
  const [previewUrl, setPreviewUrl] = useState("");
  const [mixing, setMixing] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("episode") || "";
    const found = readDeepDives().find((item) => item.id === id) || null;
    setEpisode(found);
    if (found) void readEpisodeAudio(found.id).then(setEpisodeAudio).catch(() => setEpisodeAudio(null));
  }, []);

  const hasAudio = Boolean(episodeAudio || episode?.remoteAudioUrl);
  const transcript = useMemo(() => episode?.segments.map((segment) => `${segment.title}\n${segment.script.replace(/\\n/g, "\n")}`).join("\n\n") || "", [episode]);

  function downloadTranscript() {
    if (!episode || !transcript) return;
    downloadBlob(new Blob([`${episode.title}\n\n${transcript}`], { type:"text/plain;charset=utf-8" }), `${episode.title.replace(/[^a-z0-9]+/gi,"-")}-Transcript.txt`);
  }

  function chooseMusic(file:File|undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { setNotice("Choose a supported audio file."); return; }
    if (musicFile?.url) URL.revokeObjectURL(musicFile.url);
    setMusicFile({ name:file.name, url:URL.createObjectURL(file) });
    setNotice(`${file.name} is ready for the post-production mix.`);
  }

  async function makeMusicMix(download:boolean) {
    if (!episode || !musicFile || mixing) return;
    setMixing(true);
    setNotice(download ? "Exporting the music mix…" : "Preparing a preview mix…");
    try {
      let sourceAudio = episodeAudio;
      if (!sourceAudio && episode.remoteAudioUrl) {
        const response = await fetch(episode.remoteAudioUrl);
        if (!response.ok) throw new Error("Finished audio could not be loaded for mixing.");
        sourceAudio = await response.blob();
      }
      if (!sourceAudio) throw new Error("Finished audio is not available yet.");
      const voiceUrl = URL.createObjectURL(sourceAudio);
      try {
        const result = await renderEpisodeExport({ title:episode.title, format:"wav", spatialOutput:"spatial-stereo", segments:[{ id:1,title:episode.title,audioUrl:voiceUrl }], musicEnabled:true, musicTracks:[{ id:"episode-music",name:musicFile.name,url:musicFile.url }], musicCueMode:"continuous", defaultMusicTrackId:"episode-music", segmentMusicMap:{}, musicVolume:voiceDucking?Math.max(4,Math.round(musicVolume*.72)):musicVolume, autoLoopMusic:autoLoop, musicPlacement, introOutroBoost:musicPlacement==="intro-outro" });
        if (download) { downloadBlob(result.blob,result.filename.replace(/\.wav$/i,"-Music-Mix.wav")); setNotice("Music mix exported successfully."); }
        else { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(result.blob)); setNotice("Preview mix is ready."); }
      } finally { URL.revokeObjectURL(voiceUrl); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "The music mix could not be created."); }
    finally { setMixing(false); }
  }

  if (!episode) return <main className="site-shell"><div className="page-container console-master-page"><Link className="project-workspace-back" href="/deep-dives">← BACK TO DEEP DIVES</Link><section className="glass-section library-empty-state"><strong>STUDIO CONSOLE LOCKED</strong><p>Create an episode before opening its console.</p></section></div></main>;

  return <main className="site-shell"><div className="page-container console-master-page">
    <Link className="project-workspace-back" href={`/deep-dives/${encodeURIComponent(episode.id)}`}>← BACK TO EPISODE</Link>
    <section className="studio-master-console glass-section">
      <header><div><span>STUDIO MASTER CONSOLE</span><h1>{episode.title}</h1><p>Live output, progress, script, and audio review · ENGINE: {episode.engine || "Workers AI → Kokoro → FFmpeg"}</p></div><b>{episode.status.toUpperCase()}</b></header>
      <div className="console-status-card"><i aria-hidden="true" /><div><strong>{episode.status === "Audio Ready" ? "EPISODE READY" : episode.generationStage || "READY TO GENERATE YOUR EPISODE"}</strong>{episode.generationError && <p>{episode.generationError}</p>}</div></div>
      <div className="console-primary-actions"><button type="button" disabled={!hasAudio} onClick={() => requestEpisodePlayback(episode.id)}>▶ PLAY</button><Link href={`/deep-dives/${encodeURIComponent(episode.id)}`}>EPISODE PAGE</Link><button type="button" disabled={!transcript} onClick={downloadTranscript}>TXT TRANSCRIPT</button></div>
      <details className="console-section" open><summary>SHOW OUTLINE &amp; SEGMENTS</summary><h2>{episode.title}</h2><div className="console-outline-list">{episode.outline.map((item)=><article key={item.number}><b>{String(item.number).padStart(2,"0")}</b><div><strong>{item.title}</strong><p>{item.summary}</p></div></article>)}</div></details>
      <details className="console-section"><summary>GENERATED LIVE SCRIPT</summary><div className="console-script-list">{episode.segments.map((segment)=><details key={segment.id}><summary>▶ {String(segment.id).padStart(2,"0")} · {segment.title}</summary><p>{segment.script.replace(/\\n/g,"\n")}</p></details>)}</div></details>
      <details className="console-section" open><summary>AUDIO EPISODE MIXER</summary><div className="console-audio-mixer"><button type="button" disabled={!hasAudio} onClick={() => requestEpisodePlayback(episode.id)}>▶ PLAY FINISHED EPISODE</button><EpisodeDownloadMenu episode={episode} disabled={!hasAudio} onStatus={setNotice} /></div></details>
      <details className="console-section" open><summary>POST-PRODUCTION MUSIC</summary><div className="episode-music-controls"><label className="episode-music-upload">ADD MUSIC<input type="file" accept="audio/*" onChange={(e)=>chooseMusic(e.target.files?.[0])}/><span>{musicFile?.name||"UPLOAD OPTIONAL AUDIO"}</span></label><fieldset><legend>PLACEMENT</legend><label><input type="radio" name="music-placement" checked={musicPlacement==="intro-outro"} onChange={()=>setMusicPlacement("intro-outro")}/> INTRO / OUTRO</label><label><input type="radio" name="music-placement" checked={musicPlacement==="continuous"} onChange={()=>setMusicPlacement("continuous")}/> FULL EPISODE</label></fieldset><label className="episode-music-toggle"><input type="checkbox" checked={autoLoop} onChange={(e)=>setAutoLoop(e.target.checked)}/><span/> AUTO LOOP</label><label className="episode-music-range">BACKGROUND VOLUME <b>{musicVolume}%</b><input type="range" min="0" max="45" value={musicVolume} onChange={(e)=>setMusicVolume(Number(e.target.value))}/></label><label className="episode-music-toggle"><input type="checkbox" checked={voiceDucking} onChange={(e)=>setVoiceDucking(e.target.checked)}/><span/> VOICE DUCKING</label><div className="episode-music-actions"><button type="button" disabled={!musicFile||!hasAudio||mixing} onClick={()=>void makeMusicMix(false)}>{mixing?"MIXING…":"PREVIEW MIX"}</button><button type="button" disabled={!musicFile||!hasAudio||mixing} onClick={()=>void makeMusicMix(true)}>EXPORT MUSIC MIX</button></div>{previewUrl&&<audio className="episode-music-preview" controls src={previewUrl}/>}</div></details>
      <details className="console-section"><summary>EPISODE EXPORT</summary><div className="console-export"><EpisodeDownloadMenu episode={episode} disabled={!hasAudio} onStatus={setNotice}/><button type="button" disabled={!transcript} onClick={downloadTranscript}>TXT TRANSCRIPT</button></div></details>
    </section>
  </div>{notice&&<ActionToast message={notice} onDismiss={()=>setNotice("")}/>}</main>;
}
