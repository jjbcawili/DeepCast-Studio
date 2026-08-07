import {
  AudioBufferSource,
  BufferTarget,
  Mp3OutputFormat,
  Mp4OutputFormat,
  Output,
  WavOutputFormat,
  canEncodeAudio,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";

export type ExportFormat = "wav" | "mp3" | "m4a";
export type SpatialOutput = "stereo" | "spatial-stereo" | "surround-5.1";
export type ExportAudioSegment = { id: number; title: string; audioUrl: string };
export type ExportMusicTrack = { id: string; name: string; url: string };

export type EpisodeExportOptions = {
  title: string;
  format: ExportFormat;
  spatialOutput: SpatialOutput;
  segments: ExportAudioSegment[];
  musicEnabled: boolean;
  musicTracks: ExportMusicTrack[];
  musicCueMode: "continuous" | "per-segment";
  defaultMusicTrackId: string;
  segmentMusicMap: Record<number, string>;
  musicVolume: number;
  autoLoopMusic?: boolean;
  loopCrossfade?: number;
  musicPlacement?: "full" | "intro-outro";
  introOutroBoost?: boolean;
  onProgress?: (message: string) => void;
};

const SAMPLE_RATE = 48_000;
const GAP_SECONDS = 0.35;

function safeFilename(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").slice(0, 120) || "DeepCast-Episode";
}

async function decodeUrl(context: AudioContext, url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read an audio track (${response.status}).`);
  return context.decodeAudioData(await response.arrayBuffer());
}

async function renderStereoSegment(voice: AudioBuffer, music: AudioBuffer | null, musicVolume: number, musicOffset: number, preserveHostPan: boolean, autoLoop: boolean, placement: "full" | "intro-outro", isFirst: boolean, isLast: boolean, introOutroBoost: boolean) {
  const length = Math.max(1, Math.ceil(voice.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const voiceSource = offline.createBufferSource();
  const voiceGain = offline.createGain();
  voiceSource.buffer = voice;
  voiceGain.gain.value = 0.96;
  if (preserveHostPan) {
    voiceSource.connect(voiceGain).connect(offline.destination);
  } else {
    const mono = offline.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    mono.channelInterpretation = "speakers";
    voiceSource.connect(voiceGain).connect(mono).connect(offline.destination);
  }
  voiceSource.start(0);

  if (music && music.duration > 0) {
    const musicSource = offline.createBufferSource();
    const musicGain = offline.createGain();
    musicSource.buffer = music;
    musicSource.loop = autoLoop;
    const baseGain = Math.max(0.02, Math.min(0.35, musicVolume / 100));
    musicGain.gain.value = baseGain;
    const onlyEdges = placement === "intro-outro";
    const edgeSeconds = Math.min(12, voice.duration / 2);
    if (onlyEdges) {
      musicGain.gain.setValueAtTime(isFirst ? baseGain * (introOutroBoost ? 1.35 : 1) : 0, 0);
      if (isFirst) musicGain.gain.linearRampToValueAtTime(0, edgeSeconds);
      if (isLast) {
        musicGain.gain.setValueAtTime(0, Math.max(0, voice.duration - edgeSeconds));
        musicGain.gain.linearRampToValueAtTime(baseGain * (introOutroBoost ? 1.35 : 1), voice.duration);
      }
    } else {
      musicGain.gain.setValueAtTime(baseGain * (isFirst && introOutroBoost ? 1.2 : 1), 0);
      if (isFirst && introOutroBoost) musicGain.gain.linearRampToValueAtTime(baseGain, Math.min(6, voice.duration));
      if (isLast) musicGain.gain.linearRampToValueAtTime(0, voice.duration);
    }
    musicSource.connect(musicGain).connect(offline.destination);
    musicSource.start(0, musicOffset % music.duration, voice.duration);
  }

  return offline.startRendering();
}

function upmixToSurround(stereo: AudioBuffer) {
  const surround = new AudioBuffer({ numberOfChannels: 6, length: stereo.length, sampleRate: stereo.sampleRate });
  const left = stereo.getChannelData(0);
  const right = stereo.getChannelData(Math.min(1, stereo.numberOfChannels - 1));
  const frontLeft = surround.getChannelData(0);
  const frontRight = surround.getChannelData(1);
  const center = surround.getChannelData(2);
  const lfe = surround.getChannelData(3);
  const surroundLeft = surround.getChannelData(4);
  const surroundRight = surround.getChannelData(5);

  for (let index = 0; index < stereo.length; index += 1) {
    const mono = (left[index] + right[index]) * 0.5;
    frontLeft[index] = left[index] * 0.78;
    frontRight[index] = right[index] * 0.78;
    center[index] = mono * 0.62;
    lfe[index] = mono * 0.1;
    surroundLeft[index] = left[index] * 0.32;
    surroundRight[index] = right[index] * 0.32;
  }
  return surround;
}

function createSilence(channels: number) {
  return new AudioBuffer({ numberOfChannels: channels, length: Math.ceil(GAP_SECONDS * SAMPLE_RATE), sampleRate: SAMPLE_RATE });
}

async function ensureCodec(format: ExportFormat) {
  if (format === "mp3" && !(await canEncodeAudio("mp3"))) registerMp3Encoder();
  if (format === "m4a" && !(await canEncodeAudio("aac"))) registerAacEncoder();
}

export async function renderEpisodeExport(options: EpisodeExportOptions) {
  if (!options.segments.length) throw new Error("No completed audio segments are available to export.");
  if (options.format !== "wav" && options.spatialOutput === "surround-5.1") {
    throw new Error("5.1 Surround exports require WAV. MP3 and M4A support Standard or Spatial Stereo.");
  }

  await ensureCodec(options.format);
  const target = new BufferTarget();
  const format = options.format === "wav" ? new WavOutputFormat({ large: true, metadataFormat: "id3" }) : options.format === "mp3" ? new Mp3OutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target });
  const codec = options.format === "wav" ? "pcm-s16" : options.format === "mp3" ? "mp3" : "aac";
  const audioSource = new AudioBufferSource({
    codec,
    ...(options.format === "wav" ? {} : { bitrate: options.format === "mp3" ? 320_000 : 256_000 }),
    transform: { sampleRate: SAMPLE_RATE, numberOfChannels: options.spatialOutput === "surround-5.1" ? 6 : 2 },
  });
  output.addAudioTrack(audioSource, { name: options.spatialOutput === "spatial-stereo" ? "DeepCast Spatial Stereo Mix" : options.spatialOutput === "stereo" ? "DeepCast Standard Stereo Mix" : "DeepCast 5.1 Surround Mix", languageCode: "eng" });
  output.setMetadataTags({ title: options.title, artist: "DeepCast Studio", comment: options.spatialOutput === "spatial-stereo" ? "Host-panned stereo: Jiro left, Sharpay right, music center. Not an encoded Dolby Atmos master." : undefined });
  await output.start();

  const decodeContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const musicCache = new Map<string, AudioBuffer>();
  let runningOffset = 0;
  try {
    for (let index = 0; index < options.segments.length; index += 1) {
      const segment = options.segments[index];
      options.onProgress?.(`Mixing segment ${index + 1} of ${options.segments.length}: ${segment.title}`);
      const voice = await decodeUrl(decodeContext, segment.audioUrl);
      const musicTrackId = options.musicEnabled ? (options.musicCueMode === "continuous" ? options.defaultMusicTrackId : options.segmentMusicMap[segment.id]) : "";
      const musicTrack = options.musicTracks.find((track) => track.id === musicTrackId);
      let music: AudioBuffer | null = null;
      if (musicTrack) {
        music = musicCache.get(musicTrack.id) || await decodeUrl(decodeContext, musicTrack.url);
        musicCache.set(musicTrack.id, music);
      }
      const stereo = await renderStereoSegment(
        voice,
        music,
        options.musicVolume,
        options.musicCueMode === "continuous" ? runningOffset : 0,
        options.spatialOutput !== "stereo",
        options.autoLoopMusic !== false,
        options.musicPlacement || "full",
        index === 0,
        index === options.segments.length - 1,
        options.introOutroBoost !== false,
      );
      const rendered = options.spatialOutput === "surround-5.1" ? upmixToSurround(stereo) : stereo;
      await audioSource.add(rendered);
      runningOffset += voice.duration + GAP_SECONDS;
      if (index < options.segments.length - 1) await audioSource.add(createSilence(rendered.numberOfChannels));
    }
    options.onProgress?.(`Encoding ${options.format.toUpperCase()} download...`);
    await output.finalize();
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    await decodeContext.close();
  }

  if (!target.buffer) throw new Error("The audio encoder did not return a file.");
  const mimeType = options.format === "wav" ? "audio/wav" : options.format === "mp3" ? "audio/mpeg" : "audio/mp4";
  const extension = options.format;
  const suffix = options.spatialOutput === "spatial-stereo" ? "Spatial-Stereo" : options.spatialOutput === "stereo" ? "Standard-Stereo" : "5.1-Surround";
  return {
    blob: new Blob([target.buffer], { type: mimeType }),
    filename: `${safeFilename(options.title)}-${suffix}.${extension}`,
    cueSheet: null,
  };
}

export async function transcodeSavedEpisode(blob: Blob, title: string, exportFormat: ExportFormat) {
  await ensureCodec(exportFormat);
  const decodeContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer());
  const target = new BufferTarget();
  const format = exportFormat === "wav"
    ? new WavOutputFormat({ large: true, metadataFormat: "id3" })
    : exportFormat === "mp3"
      ? new Mp3OutputFormat()
      : new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target });
  const codec = exportFormat === "wav" ? "pcm-s16" : exportFormat === "mp3" ? "mp3" : "aac";
  const source = new AudioBufferSource({
    codec,
    ...(exportFormat === "wav" ? {} : { bitrate: exportFormat === "mp3" ? 320_000 : 256_000 }),
    transform: {
      sampleRate: SAMPLE_RATE,
      numberOfChannels: Math.min(2, Math.max(1, decoded.numberOfChannels)),
    },
  });
  output.addAudioTrack(source, { name: "DeepCast Spatial Stereo Mix", languageCode: "eng" });
  output.setMetadataTags({
    title,
    artist: "DeepCast Studio",
    comment: "Host-panned spatial stereo mix. Not an encoded Dolby Atmos master.",
  });
  try {
    await output.start();
    await source.add(decoded);
    await output.finalize();
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    await decodeContext.close();
  }
  if (!target.buffer) throw new Error("The audio encoder did not return a file.");
  const mimeType = exportFormat === "wav" ? "audio/wav" : exportFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
  return {
    blob: new Blob([target.buffer], { type: mimeType }),
    filename: `${safeFilename(title)}-Spatial-Stereo.${exportFormat}`,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
