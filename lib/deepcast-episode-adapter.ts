import "server-only";

type RemoteEpisode = {
  id: string;
  title?: string;
  prompt?: string;
  summary?: string;
  status?: string;
  progress?: number;
  progressMessage?: string;
  error?: string;
  script?: string;
  engine?: string;
  assets?: Array<{ kind?: string; label?: string; url?: string }>;
};

function runtimeValue(value: unknown) {
  const match = String(value || "").match(/\d+/);
  return match?.[0] || "45";
}

export function toEpisodeRequest(input: Record<string, unknown>) {
  return {
    localEpisodeId: input.localEpisodeId,
    projectId: input.projectId,
    episodeTitle: input.episodeTitle,
    prompt: input.topic,
    format: input.format,
    runtime: runtimeValue(input.length),
    webSearch: Boolean(input.useWebSearch),
    sourceMaterial: input.source,
    producerInstructions: input.producerInstructions,
    scriptGuidance: input.scriptGuidance,
    guidanceMode: input.scriptGuidanceMode || "guided",
    allowVerifiedAdditions: input.allowVerifiedAdditions,
    host1: {
      name: input.jiroName || "JIRO",
      voice: input.jiroVoice,
      profile: input.jiroProfile,
      style: input.jiroStyle,
      pace: input.jiroPace,
      accent: input.jiroAccent,
      banter: input.jiroBanter,
      ttsEngine: input.jiroTtsEngine || "chatterbox-nano",
      voiceReferenceKey: input.jiroVoiceReferenceKey,
      voiceReferenceText: input.jiroVoiceReferenceText,
    },
    host2: {
      name: input.sharpayName || "SHARPAY",
      voice: input.sharpayVoice,
      profile: input.sharpayProfile,
      style: input.sharpayStyle,
      pace: input.sharpayPace,
      accent: input.sharpayAccent,
      energy: input.sharpayEnergy,
      ttsEngine: input.sharpayTtsEngine || "chatterbox-nano",
      voiceReferenceKey: input.sharpayVoiceReferenceKey,
      voiceReferenceText: input.sharpayVoiceReferenceText,
    },
    downloadFormat: "MP3",
    audioOutput: "Spatial Stereo",
  };
}

export function remoteEpisode(payload: unknown): RemoteEpisode {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const episode = body.episode && typeof body.episode === "object" ? body.episode as RemoteEpisode : body as RemoteEpisode;
  return episode;
}

export function toLegacySnapshot(episode: RemoteEpisode) {
  const remoteStatus = String(episode.status || "QUEUED").toUpperCase();
  const status = remoteStatus === "COMPLETE"
    ? "complete"
    : remoteStatus === "FAILED"
      ? "failed"
      : remoteStatus === "CANCELLED"
        ? "cancelled"
        : remoteStatus === "QUEUED"
          ? "pending"
          : "processing";
  const scriptText = String(episode.script || "").trim();
  const segmentStatus = status === "complete" ? "complete" : status === "failed" ? "failed" : "processing";
  const finalAsset = Array.isArray(episode.assets)
    ? episode.assets.find((asset) => asset?.url && ["mp3", "m4a", "wav"].includes(String(asset.kind || "").toLowerCase()))
    : undefined;

  return {
    id: episode.id,
    title: episode.title || "Untitled Deep Dive",
    status,
    progress: Number(episode.progress || 0),
    stage: episode.progressMessage || "Generating episode in the background…",
    error: episode.error,
    engine: episode.engine,
    finalAudioUrl: finalAsset?.url,
    script: scriptText ? {
      title: episode.title || "Untitled Deep Dive",
      summary: episode.summary || episode.prompt || "",
      outline: [{ number: 1, title: "Complete Episode", summary: episode.prompt || "" }],
      segments: [{ id: 1, title: "Complete Episode Script", script: scriptText }],
    } : undefined,
    segments: [{ id: 1, status: segmentStatus, error: status === "failed" ? episode.error : undefined, engine: episode.engine }],
  };
}
