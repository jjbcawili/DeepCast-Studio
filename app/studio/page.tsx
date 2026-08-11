"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpeakerSettings, { type HostId, type HostVoiceSettings } from "./SpeakerSettings";
import type { TtsVoiceName } from "../../lib/tts-voices";
import {
  createSourceId,
  readProjectSources,
  readProjects,
  sourceTitleFromContent,
  writeProjectSources,
  type DeepCastProject,
  type ProjectSourceRecord,
} from "../../lib/project-storage";
import type { ExportFormat, SpatialOutput } from "../../lib/audio-export";
import { readDeepDives, saveDeepDive } from "../../lib/deep-dive-storage";
import { parseDialogueTurns, renderHostPannedDialogue } from "../../lib/spatial-dialogue";
import { AUTO_COVER_OPTIONS, automaticCoverFor } from "../../lib/cover-art";
import { beginBackgroundJob } from "../../lib/background-jobs";
import ProjectWorkspaceHeader from "../components/ProjectWorkspaceHeader";
import { saveEpisodeAudio } from "../../lib/audio-library";

type OutlineItem = { number: number; title: string; summary: string };
type EpisodeSegment = { id: number; title: string; script: string };
type GeneratedEpisode = { title: string; summary?: string; outline: OutlineItem[]; segments: EpisodeSegment[] };
type AudioSegment = EpisodeSegment & {
  audioUrl?: string;
  status: "pending" | "generating" | "ready" | "failed";
  error?: string;
  engine?: string;
  fallbackUsed?: boolean;
};
type DriveConnection = "disconnected" | "connecting" | "connected" | "error";
type EpisodeFormat = "deep-dive" | "debate" | "brief" | "critique";
type ScriptGuidanceMode = "guided" | "close";
type MusicTrack = { id: string; name: string; url: string; size: number; type: string };
type MusicCueMode = "continuous" | "per-segment";
type MusicMode = "none" | "upload" | "generate";
type CoverMode = "auto" | "upload" | "project" | "none";
type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string; webViewLink?: string };
type BackgroundJobSnapshot = {
  id: string;
  status: "queued" | "processing" | "complete" | "partial" | "failed" | "cancelled";
  stage: string;
  progress: number;
  error?: string | null;
  script?: GeneratedEpisode | null;
  segments: Array<{ id: number; title: string; status: "queued" | "processing" | "complete" | "failed"; engine?: string | null; error?: string | null }>;
};

const FORMAT_OPTIONS: Array<{ value: EpisodeFormat; label: string; description: string }> = [
  { value: "deep-dive", label: "Deep Dive", description: "Layered, evidence-led exploration" },
  { value: "debate", label: "Debate", description: "Contrasting positions and rebuttals" },
  { value: "brief", label: "Brief", description: "Fast, fact-first summary" },
  { value: "critique", label: "Critique", description: "Structured evaluation and verdict" },
];

const LENGTH_OPTIONS: Record<EpisodeFormat, Array<{ value: string; label: string }>> = {
  "deep-dive": [
    { value: "flexible", label: "Flexible Runtime (AI selects approx. 15–60 minutes)" },
    { value: "15", label: "Focused Deep Dive (approx. 15 minutes)" },
    { value: "30", label: "Standard Deep Dive (approx. 30 minutes)" },
    { value: "45", label: "Extended Deep Dive (approx. 45 minutes)" },
    { value: "60", label: "Feature Deep Dive (approx. 45–60 minutes)" },
  ],
  debate: [
    { value: "flexible", label: "Flexible Runtime (AI selects approx. 10–45 minutes)" },
    { value: "10", label: "Quick Debate (approx. 10 minutes)" },
    { value: "20", label: "Standard Debate (approx. 20 minutes)" },
    { value: "30", label: "Extended Debate (approx. 30 minutes)" },
    { value: "45", label: "Full Debate (approx. 45 minutes)" },
  ],
  brief: [
    { value: "flexible", label: "Flexible Runtime (AI selects approx. 3–15 minutes)" },
    { value: "3", label: "Flash Brief (approx. 3 minutes)" },
    { value: "5", label: "Quick Brief (approx. 5 minutes)" },
    { value: "10", label: "Detailed Brief (approx. 10 minutes)" },
    { value: "15", label: "Extended Brief (approx. 15 minutes)" },
  ],
  critique: [
    { value: "flexible", label: "Flexible Runtime (AI selects approx. 10–45 minutes)" },
    { value: "10", label: "Quick Critique (approx. 10 minutes)" },
    { value: "20", label: "Standard Critique (approx. 20 minutes)" },
    { value: "30", label: "Extended Critique (approx. 30 minutes)" },
    { value: "45", label: "Full Critical Review (approx. 45 minutes)" },
  ],
};

const DEFAULT_LENGTH: Record<EpisodeFormat, string> = { "deep-dive": "30", debate: "20", brief: "5", critique: "20" };

const DRIVE_AUTH_WORKER = "https://deepcast-drive-auth.sharpaysfabulousmusicdatabase.workers.dev";
const DRIVE_TOKEN_KEY = "deepcast.drive.accessToken";
const DRIVE_TOKEN_EXPIRY_KEY = "deepcast.drive.expiresAt";
const ACTIVE_GENERATION_JOB_KEY = "deepcast.active-generation-job.v1";
const REFERENCE_TTS_ENGINES = new Set<HostVoiceSettings["ttsEngine"]>(["chatterbox-nano", "chatterbox-turbo", "f5-tts", "fish-s2", "dia2"]);

function removeDriveAuthParams() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("drive_auth");
  cleanUrl.searchParams.delete("drive_auth_error");
  window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

async function getFailureMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `Generation failed (${response.status}).`;
}

const MAX_SOURCE_CONTEXT_CHARS = 30_000;
const MAX_SOURCE_EXCERPT_CHARS = 8_000;

function buildCompactSourceContext(sources: ProjectSourceRecord[]) {
  if (!sources.length) return "";

  const metadataBlocks = sources.map((source) => [
    `SOURCE: ${source.title}`,
    source.siteName ? `SITE: ${source.siteName}` : "",
    source.url ? `URL: ${source.url}` : "",
    source.overview ? `OVERVIEW: ${source.overview.slice(0, 500)}` : "",
  ].filter(Boolean).join("\n"));
  const metadataBudget = metadataBlocks.reduce((total, block) => total + block.length + 2, 0);
  const fairShare = Math.max(160, Math.min(
    MAX_SOURCE_EXCERPT_CHARS,
    Math.floor((MAX_SOURCE_CONTEXT_CHARS - metadataBudget) / sources.length) - 24,
  ));
  const sections: string[] = [];
  let used = 0;

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const metadata = metadataBlocks[index];
    const remaining = MAX_SOURCE_CONTEXT_CHARS - used - metadata.length - 2;
    if (remaining <= 0) break;
    const rawContent = source.content.trim();
    const content = rawContent.slice(0, Math.min(fairShare, remaining));
    const section = `${metadata}\nEXCERPT: ${content}${rawContent.length > content.length ? "\n[Excerpt shortened for generation]" : ""}`;
    sections.push(section);
    used += section.length + 2;
  }

  return sections.join("\n\n").slice(0, MAX_SOURCE_CONTEXT_CHARS);
}

export default function StudioPage() {
  const router = useRouter();
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<EpisodeFormat>("deep-dive");
  const [length, setLength] = useState("30");
  const [projects, setProjects] = useState<DeepCastProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectSources, setProjectSources] = useState<ProjectSourceRecord[]>([]);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [producerInstructions, setProducerInstructions] = useState("");
  const [scriptGuidance, setScriptGuidance] = useState("");
  const [scriptGuidanceName, setScriptGuidanceName] = useState("");
  const [scriptGuidanceMode, setScriptGuidanceMode] =
    useState<ScriptGuidanceMode>("guided");
  const [allowVerifiedAdditions, setAllowVerifiedAdditions] = useState(true);
  const [jiroBanter, setJiroBanter] = useState(80);
  const [sharpayEnergy, setSharpayEnergy] = useState(90);
  const [notice, setNotice] = useState("");
  const [episode, setEpisode] = useState<GeneratedEpisode | null>(null);
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("Ready to generate your episode");
  const [driveConnection, setDriveConnection] = useState<DriveConnection>("disconnected");
  const [activeHost, setActiveHost] = useState<HostId>("jiro");
  const [hostNames, setHostNames] = useState<Record<HostId, string>>({ jiro: "Jiro", sharpay: "Sharpay" });
  const [hostSettings, setHostSettings] = useState<Record<HostId, HostVoiceSettings>>({
    jiro: {
      voice: "Orus",
      audioProfile: "A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.",
      style: "Dry Wit",
      pace: "Conversational",
      accent: "American (General)",
      ttsEngine: "chatterbox-nano",
      orpheusVoice: "daniel",
    },
    sharpay: {
      voice: "Achernar",
      audioProfile: "A theatrical, slightly nasal, diva-like female host with playful main-character energy; funny, expressive, a little savage, but respectful and accurate.",
      style: "Vocal Smile",
      pace: "Up-tempo",
      accent: "American (General)",
      ttsEngine: "chatterbox-nano",
      orpheusVoice: "hannah",
    },
  });
  const [voiceSearch, setVoiceSearch] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState("");
  const [previewLabel, setPreviewLabel] = useState("");
  const [sourceSelectorOpen, setSourceSelectorOpen] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => new Set<string>());
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const [sourceContent, setSourceContent] = useState("");
  const [driveSelectorOpen, setDriveSelectorOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicMode, setMusicMode] = useState<MusicMode>("none");
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicCueMode, setMusicCueMode] = useState<MusicCueMode>("continuous");
  const [defaultMusicTrackId, setDefaultMusicTrackId] = useState("");
  const [segmentMusicMap, setSegmentMusicMap] = useState<Record<number, string>>({});
  const [musicVolume, setMusicVolume] = useState(12);
  const [autoLoopMusic, setAutoLoopMusic] = useState(true);
  const [voiceDucking, setVoiceDucking] = useState(true);
  const [loopCrossfade, setLoopCrossfade] = useState(0.8);
  const [musicPlacement, setMusicPlacement] = useState<"full" | "intro-outro">("full");
  const [introOutroBoost, setIntroOutroBoost] = useState(true);
  const [coverMode, setCoverMode] = useState<CoverMode>("auto");
  const [selectedAutoCover, setSelectedAutoCover] = useState<string>(AUTO_COVER_OPTIONS[0].src);
  const [completedEpisodeId, setCompletedEpisodeId] = useState("");
  const [uploadedCover, setUploadedCover] = useState("");
  const [uploadedCoverName, setUploadedCoverName] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const [spatialOutput, setSpatialOutput] = useState<SpatialOutput>("spatial-stereo");
  const [isExporting, setIsExporting] = useState(false);
  const [retryingSegmentId, setRetryingSegmentId] = useState<number | null>(null);
  const [activeBackgroundJobId, setActiveBackgroundJobId] = useState("");
  const authTicketHandled = useRef(false);
  const monitoringJobRef = useRef("");
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicTracksRef = useRef<MusicTrack[]>([]);

  const selectedSources = useMemo(() => projectSources.filter((source) => selectedSourceIds.has(source.id)), [projectSources, selectedSourceIds]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId), [projects, selectedProjectId]);
  const activeGenerationEngine = useMemo(() => {
    return audioSegments.find((segment) => segment.engine)?.engine || "Gemini TTS";
  }, [audioSegments]);
  const filteredDriveFiles = useMemo(() => {
    const query = driveSearch.trim().toLowerCase();
    return query ? driveFiles.filter((file) => file.name.toLowerCase().includes(query)) : driveFiles;
  }, [driveFiles, driveSearch]);
  const selectedCover = coverMode === "none"
    ? undefined
    : coverMode === "upload"
      ? uploadedCover || undefined
      : coverMode === "project"
        ? selectedProject?.coverImage || automaticCoverFor(selectedProjectId || "project")
        : selectedAutoCover;

  const redeemDriveTicket = useCallback(async (ticket: string) => {
    try {
      const response = await fetch(`${DRIVE_AUTH_WORKER}/auth/result?ticket=${encodeURIComponent(ticket)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        accessToken?: string;
        expiresIn?: number;
        error?: string;
      } | null;

      if (!response.ok || !result?.ok || !result.accessToken) {
        throw new Error(result?.error || "Google Drive authentication could not be completed.");
      }

      const expiresIn = Math.max(60, Number(result.expiresIn) || 3_600);
      window.sessionStorage.setItem(DRIVE_TOKEN_KEY, result.accessToken);
      window.sessionStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1_000));
      setDriveConnection("connected");
      setNotice("Google Drive connected securely for this browser session.");
    } catch (error) {
      window.sessionStorage.removeItem(DRIVE_TOKEN_KEY);
      window.sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
      setDriveConnection("error");
      setNotice(error instanceof Error ? error.message : "Google Drive connection failed. Please try again.");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Query state is intentionally applied after hydration in this client-only Studio route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get("topic")) setTopic(params.get("topic") || "");
    const availableProjects = readProjects();
    setProjects(availableProjects);
    const requestedProject = params.get("project");
    const requestedEpisode = params.get("episode");
    const savedEpisode = requestedEpisode ? readDeepDives().find((item) => item.id === requestedEpisode) : undefined;
    if (requestedProject && availableProjects.some((project) => project.id === requestedProject)) setSelectedProjectId(requestedProject);
    else if (savedEpisode?.projectId && availableProjects.some((project) => project.id === savedEpisode.projectId)) setSelectedProjectId(savedEpisode.projectId);
    else if (!requestedEpisode && availableProjects[0]) setSelectedProjectId(availableProjects[0].id);
    if (savedEpisode) {
      setEpisodeTitle(savedEpisode.title);
      setTopic(savedEpisode.topic);
      setFormat(savedEpisode.format);
      setLength(savedEpisode.targetLength);
      setEpisode({
        title: savedEpisode.title,
        summary: savedEpisode.summary,
        outline: savedEpisode.outline,
        segments: savedEpisode.segments,
      });
      setCompletedEpisodeId(savedEpisode.id);
      if (savedEpisode.coverImage) {
        setUploadedCover(savedEpisode.coverImage);
        setUploadedCoverName("Saved episode cover");
        setCoverMode("upload");
      }
    }

    const storedToken = window.sessionStorage.getItem(DRIVE_TOKEN_KEY);
    const storedExpiry = Number(window.sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || 0);
    if (storedToken && storedExpiry > Date.now() + 30_000) {
      setDriveConnection("connected");
    } else {
      window.sessionStorage.removeItem(DRIVE_TOKEN_KEY);
      window.sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
    }

    const oauthError = params.get("drive_auth_error");
    const ticket = params.get("drive_auth");
    if (oauthError) {
      setDriveConnection("error");
      setNotice(`Google Drive connection failed: ${oauthError.replaceAll("_", " ")}.`);
      removeDriveAuthParams();
      return;
    }

    if (!ticket || authTicketHandled.current) return;
    authTicketHandled.current = true;
    setDriveConnection("connecting");
    setNotice("Finishing the secure Google Drive connection...");
    removeDriveAuthParams();

    void redeemDriveTicket(ticket);
  }, [redeemDriveTicket]);

  useEffect(() => {
    const storedJobId = window.localStorage.getItem(ACTIVE_GENERATION_JOB_KEY);
    if (storedJobId) void monitorBackgroundJob(storedJobId, true);
    // A background job must be resumed exactly once after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const restoreSources = () => {
      const restored = readProjectSources(selectedProjectId);
      setProjectSources(restored);
      setSelectedSourceIds(new Set(restored.filter((source) => source.selected !== false).map((source) => source.id)));
    };
    restoreSources();
    const handleSourceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === selectedProjectId) restoreSources();
    };
    window.addEventListener("deepcast-project-sources-updated", handleSourceUpdate);
    window.addEventListener("storage", restoreSources);
    return () => {
      window.removeEventListener("deepcast-project-sources-updated", handleSourceUpdate);
      window.removeEventListener("storage", restoreSources);
    };
  }, [selectedProjectId]);

  useEffect(() => () => {
    if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
  }, [previewAudioUrl]);

  useEffect(() => {
    musicTracksRef.current = musicTracks;
  }, [musicTracks]);

  useEffect(() => () => {
    musicTracksRef.current.forEach((track) => URL.revokeObjectURL(track.url));
  }, []);

  function updateHostSettings(host: HostId, settings: HostVoiceSettings) {
    setHostSettings((current) => ({ ...current, [host]: settings }));
  }

  function updateHostName(host: HostId, name: string) {
    setHostNames((current) => ({ ...current, [host]: name }));
  }

  function changeFormat(nextFormat: EpisodeFormat) {
    setFormat(nextFormat);
    setLength(DEFAULT_LENGTH[nextFormat]);
  }

  function toggleProjectSource(sourceId: string) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  function persistProjectSources(next: ProjectSourceRecord[]) {
    try {
      writeProjectSources(selectedProjectId, next);
      setProjectSources(next);
      return true;
    } catch {
      setNotice("Project source storage is full in this browser. Remove or shorten a source and try again.");
      return false;
    }
  }

  function addManualProjectSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !sourceContent.trim()) return;
    if (!window.confirm("Add this copied text to the selected project?")) return;
    const content = sourceContent.trim().slice(0, 120_000);
    const record: ProjectSourceRecord = {
      id: createSourceId("manual"),
      projectId: selectedProjectId,
      title: sourceTitleFromContent(content),
      kind: "Pasted text",
      detail: `${content.length.toLocaleString()} characters`,
      content,
      origin: "manual",
      createdAt: new Date().toISOString(),
    };
    const next = [record, ...projectSources];
    if (!persistProjectSources(next)) return;
    setSelectedSourceIds((current) => new Set(current).add(record.id));
    setSourceContent("");
    setSourceEditorOpen(false);
    setNotice("Project source saved and selected for this episode.");
  }

  function removeProjectSource(sourceId: string) {
    const source = projectSources.find((item) => item.id === sourceId);
    if (!window.confirm(`Remove “${source?.title || "this source"}” from the project?`)) return;
    const next = projectSources.filter((source) => source.id !== sourceId);
    if (!persistProjectSources(next)) return;
    setSelectedSourceIds((current) => {
      const updated = new Set(current);
      updated.delete(sourceId);
      return updated;
    });
    setNotice("Source removed from this project.");
  }

  function getDriveToken() {
    const token = window.sessionStorage.getItem(DRIVE_TOKEN_KEY) || "";
    const expiry = Number(window.sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || 0);
    // Token freshness is intentionally evaluated at the moment of a user action.
    // eslint-disable-next-line react-hooks/purity
    if (!token || expiry <= Date.now() + 30_000) {
      window.sessionStorage.removeItem(DRIVE_TOKEN_KEY);
      window.sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
      setDriveConnection("disconnected");
      return "";
    }
    return token;
  }

  function driveFileSupported(file: DriveFile) {
    return file.mimeType === "application/vnd.google-apps.document"
      || file.mimeType === "application/vnd.google-apps.spreadsheet"
      || file.mimeType.startsWith("text/")
      || ["application/json", "application/xml", "application/csv"].includes(file.mimeType);
  }

  async function openDriveSelector() {
    const token = getDriveToken();
    if (!token) {
      connectGoogleDrive();
      return;
    }
    setDriveSelectorOpen(true);
    setDriveLoading(true);
    setDriveSearch("");
    try {
      const fields = "files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken";
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=100&orderBy=modifiedTime%20desc&q=trashed%3Dfalse&fields=${encodeURIComponent(fields)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const result = await response.json().catch(() => null) as { files?: DriveFile[]; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || `Google Drive file list failed (${response.status}).`);
      setDriveFiles(Array.isArray(result?.files) ? result.files : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Google Drive file selection failed.");
      setDriveSelectorOpen(false);
    } finally {
      setDriveLoading(false);
    }
  }

  async function addDriveFile(file: DriveFile) {
    if (!driveFileSupported(file)) {
      setNotice("This file type cannot be converted to episode text yet. Choose Google Docs, Sheets, TXT, Markdown, CSV, JSON, or XML.");
      return;
    }
    const token = getDriveToken();
    if (!token) {
      setNotice("Google Drive authorization expired. Connect Drive again.");
      return;
    }
    setDriveLoading(true);
    setNotice(`Importing ${file.name} from Google Drive...`);
    try {
      const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
      const isGoogleSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
      const endpoint = isGoogleDoc || isGoogleSheet
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(isGoogleSheet ? "text/csv" : "text/plain")}`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Google Drive could not export this file (${response.status}).`);
      const content = (await response.text()).trim().slice(0, 120_000);
      if (!content) throw new Error("The selected Drive file did not contain readable text.");
      const record: ProjectSourceRecord = {
        id: createSourceId("drive"),
        projectId: selectedProjectId,
        title: file.name.slice(0, 100),
        kind: "Google Drive",
        detail: `${content.length.toLocaleString()} characters`,
        content,
        origin: "google-drive",
        driveFileId: file.id,
        createdAt: new Date().toISOString(),
      };
      const next = [record, ...projectSources.filter((source) => source.driveFileId !== file.id)];
      if (!persistProjectSources(next)) return;
      setSelectedSourceIds((current) => new Set(current).add(record.id));
      setDriveSelectorOpen(false);
      setSourceSelectorOpen(true);
      setNotice(`${file.name} added to ${selectedProject?.title || "the project"} and selected for this episode.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Drive file could not be imported.");
    } finally {
      setDriveLoading(false);
    }
  }

  async function previewVoice(voice: TtsVoiceName) {
    const settings = hostSettings[activeHost];
    const hostName = hostNames[activeHost].trim() || (activeHost === "jiro" ? "Jiro" : "Sharpay");
    setPreviewingVoice(`${activeHost}:${voice}`);
    setNotice(`Preparing a ${voice} voice preview for ${hostName}...`);

    try {
      const response = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "voice-preview",
          host: activeHost,
          hostName,
          voice,
          audioProfile: settings.audioProfile,
          style: settings.style,
          pace: settings.pace,
          accent: settings.accent,
        }),
      });
      if (!response.ok) throw new Error(await getFailureMessage(response));
      const audioUrl = URL.createObjectURL(await response.blob());
      const engine = response.headers.get("X-DeepCast-Engine") || "Gemini TTS";
      setPreviewAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return audioUrl;
      });
      setPreviewLabel(`${hostName} · ${voice} · ${engine.toUpperCase()}`);
      setNotice(`${voice} preview ready. Select the voice row to use it for ${hostName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Voice preview failed. Please try again.");
    } finally {
      setPreviewingVoice(null);
    }
  }

  function connectGoogleDrive() {
    if (driveConnection === "connected") {
      void openDriveSelector();
      return;
    }

    setDriveConnection("connecting");
    window.location.assign(`${DRIVE_AUTH_WORKER}/auth/google?return=${encodeURIComponent("/studio")}`);
  }

  async function exportEpisode() {
    if (!episode) {
      setNotice("Generate an episode before exporting a complete audio file.");
      return;
    }
    const readySegments = audioSegments.filter((segment): segment is AudioSegment & { audioUrl: string } => segment.status === "ready" && Boolean(segment.audioUrl));
    if (!readySegments.length) {
      setNotice("No completed audio segments are ready to export.");
      return;
    }
    if (readySegments.length !== audioSegments.length) {
      setNotice("All episode segments must finish successfully before a complete export can be created.");
      return;
    }
    setIsExporting(true);
    setNotice("Preparing the episode audio renderer...");
    try {
      const { downloadBlob, renderEpisodeExport } = await import("../../lib/audio-export");
      const rendered = await renderEpisodeExport({
        title: episode.title,
        format: exportFormat,
        spatialOutput,
        segments: readySegments.map((segment) => ({ id: segment.id, title: segment.title, audioUrl: segment.audioUrl })),
        musicEnabled,
        musicTracks,
        musicCueMode,
        defaultMusicTrackId,
        segmentMusicMap,
        musicVolume,
        autoLoopMusic,
        loopCrossfade,
        musicPlacement,
        introOutroBoost,
        onProgress: setNotice,
      });
      downloadBlob(rendered.blob, rendered.filename);
      if (rendered.cueSheet) {
        downloadBlob(new Blob([JSON.stringify(rendered.cueSheet, null, 2)], { type: "application/json" }), rendered.filename.replace(/\.wav$/i, "-Cue-Sheet.json"));
      }
      setNotice(`${exportFormat.toUpperCase()} export ready and downloaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Episode export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  function handleMusicUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const availableSlots = Math.max(0, 12 - musicTracks.length);
    const audioExtension = /\.(mp3|wav|m4a|aac)$/i;
    const validFiles = files
      .filter((file) => (file.type.startsWith("audio/") || audioExtension.test(file.name)) && file.size <= 300 * 1024 * 1024)
      .slice(0, availableSlots);
    if (!validFiles.length) {
      setNotice(availableSlots === 0 ? "The 12-track Studio session limit has been reached." : "Choose an MP3, WAV, M4A, or AAC audio file up to 300 MB.");
      event.target.value = "";
      return;
    }
    if (!window.confirm(`Add ${validFiles.length} background ${validFiles.length === 1 ? "track" : "tracks"} to this Studio session?`)) {
      event.target.value = "";
      return;
    }

    const uploaded = validFiles.map((file, index) => ({
      id: `music-${Date.now()}-${index}`,
      name: file.name,
      url: URL.createObjectURL(file),
      size: file.size,
      type: file.type || "audio",
    }));
    setMusicTracks((current) => [...current, ...uploaded]);
    setDefaultMusicTrackId((current) => current || uploaded[0].id);
    setMusicEnabled(true);
    setMusicMode("upload");
    setNotice(`${uploaded.length} background track${uploaded.length === 1 ? "" : "s"} added for this Studio session.`);
    event.target.value = "";
  }

  async function handleEpisodeCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setNotice("Choose a JPG, PNG, or WebP cover image up to 8 MB.");
      return;
    }
    if (!window.confirm(`Use “${file.name}” as this episode’s cover art?`)) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadedCover(dataUrl);
      setUploadedCoverName(file.name);
      setCoverMode("upload");
      setNotice("Episode cover art added.");
    } catch {
      setNotice("The selected cover image could not be read.");
    }
  }

  async function handleScriptGuidanceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Choose a TXT or Markdown script up to 2 MB.");
      return;
    }
    try {
      const text = await file.text();
      setScriptGuidance(text.slice(0, 120_000));
      setScriptGuidanceName(file.name);
      setNotice(`${file.name} is ready as optional script guidance.`);
    } catch {
      setNotice("The selected script could not be read.");
    }
  }

  function removeMusicTrack(trackId: string) {
    const track = musicTracks.find((item) => item.id === trackId);
    if (!window.confirm(`Remove “${track?.name || "this track"}” from the Studio session?`)) return;
    if (track) URL.revokeObjectURL(track.url);
    const remaining = musicTracks.filter((item) => item.id !== trackId);
    setMusicTracks(remaining);
    setDefaultMusicTrackId((current) => current === trackId ? remaining[0]?.id || "" : current);
    setSegmentMusicMap((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== trackId)));
    if (!remaining.length) setMusicEnabled(false);
  }

  function playBackgroundMusic(segmentId: number) {
    const player = backgroundAudioRef.current;
    if (!player || !musicEnabled) return;
    const trackId = musicCueMode === "continuous" ? defaultMusicTrackId : segmentMusicMap[segmentId];
    const track = musicTracks.find((item) => item.id === trackId);
    if (!track) return;
    if (player.src !== track.url) {
      player.src = track.url;
      player.currentTime = 0;
    }
    player.loop = musicCueMode === "continuous";
    player.volume = musicVolume / 100;
    void player.play().catch(() => setNotice("Tap play again if the browser blocked background-audio playback."));
  }

  function pauseBackgroundMusic() {
    backgroundAudioRef.current?.pause();
  }

  function stopBackgroundMusic() {
    const player = backgroundAudioRef.current;
    if (!player) return;
    player.pause();
    if (musicCueMode === "per-segment") player.currentTime = 0;
  }

  async function monitorBackgroundJob(jobId: string, resumed = false) {
    if (!jobId || monitoringJobRef.current === jobId) return;
    monitoringJobRef.current = jobId;
    setActiveBackgroundJobId(jobId);
    setIsGenerating(true);
    const trayJob = beginBackgroundJob(
      resumed ? "Resuming Deep Dive" : "Generating Deep Dive",
      resumed ? "Restoring saved generation progress…" : "Queued for background generation…",
      selectedProjectId || undefined,
      `generation-${jobId}`,
    );
    try {
      let snapshot: BackgroundJobSnapshot | null = null;
      while (true) {
        const response = await fetch(`/api/background/jobs/${encodeURIComponent(jobId)}?compact=1`, { cache: "no-store" });
        if (!response.ok) throw new Error(await getFailureMessage(response));
        snapshot = await response.json() as BackgroundJobSnapshot;
        const progress = Math.max(0, Math.min(100, Math.round(snapshot.progress || 0)));
        if (snapshot.status !== "pending" || progress > 0) setNotice("");
        setGenerationProgress(progress);
        setGenerationStage(snapshot.stage || "Generating episode in the background…");
        trayJob.update(snapshot.stage || "Generating episode in the background…", progress);
        if (snapshot.script) {
          setEpisode(snapshot.script);
          setEpisodeTitle((current) => current || snapshot!.script!.title);
          setAudioSegments((current) => snapshot!.script!.segments.map((segment) => {
            const remote = snapshot!.segments.find((item) => item.id === segment.id);
            const existing = current.find((item) => item.id === segment.id);
            return {
              ...segment,
              audioUrl: existing?.audioUrl,
              status: remote?.status === "complete" ? "ready" : remote?.status === "failed" ? "failed" : remote?.status === "processing" ? "generating" : "pending",
              error: remote?.error || undefined,
              engine: remote?.engine || existing?.engine,
            };
          }));
        }
        if (["complete", "partial", "failed", "cancelled"].includes(snapshot.status)) {
          const fullResponse = await fetch(`/api/background/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
          if (!fullResponse.ok) throw new Error(await getFailureMessage(fullResponse));
          snapshot = await fullResponse.json() as BackgroundJobSnapshot;
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_500));
      }

      if (!snapshot) throw new Error("Generation status was not returned.");
      if (snapshot.status === "failed" || snapshot.status === "cancelled" || !snapshot.script) {
        throw new Error(snapshot.error || snapshot.stage || "Background generation failed.");
      }

      const readySegments: AudioSegment[] = [];
      for (const segment of snapshot.script.segments) {
        const remote = snapshot.segments.find((item) => item.id === segment.id);
        if (remote?.status !== "complete") {
          readySegments.push({ ...segment, status: "failed", error: remote?.error || "This section needs to be retried." });
          continue;
        }
        const audioResponse = await fetch(`/api/background/jobs/${encodeURIComponent(jobId)}/segments/${segment.id}/audio`);
        if (!audioResponse.ok) {
          readySegments.push({ ...segment, status: "failed", error: await getFailureMessage(audioResponse) });
          continue;
        }
        readySegments.push({ ...segment, status: "ready", audioUrl: URL.createObjectURL(await audioResponse.blob()), engine: remote?.engine || "Chatterbox" });
      }
      setAudioSegments(readySegments);

      const allReady = readySegments.every((segment) => segment.status === "ready" && segment.audioUrl);
      const storedEpisodeId = `episode-${jobId}`;
      let runtimeSeconds: number | undefined;
      if (allReady) {
        setGenerationProgress(96);
        setGenerationStage("Mastering the complete episode…");
        trayJob.update("Mastering the complete episode…", 96);
        const { renderEpisodeExport } = await import("../../lib/audio-export");
        const master = await renderEpisodeExport({
          title: snapshot.script.title,
          format: "wav",
          spatialOutput: "spatial-stereo",
          segments: readySegments.map((segment) => ({ id: segment.id, title: segment.title, audioUrl: segment.audioUrl! })),
          musicEnabled: musicMode === "upload" && musicEnabled,
          musicTracks,
          musicCueMode,
          defaultMusicTrackId,
          segmentMusicMap,
          musicVolume: voiceDucking ? Math.max(4, Math.round(musicVolume * 0.72)) : musicVolume,
          autoLoopMusic,
          loopCrossfade,
          musicPlacement,
          introOutroBoost,
        });
        await saveEpisodeAudio(storedEpisodeId, master.blob);
        const durationContext = new AudioContext();
        try {
          runtimeSeconds = (await durationContext.decodeAudioData(await master.blob.arrayBuffer())).duration;
        } finally {
          await durationContext.close();
        }
      }

      const project = readProjects().find((item) => item.id === selectedProjectId);
      saveDeepDive({
        id: storedEpisodeId,
        title: snapshot.script.title,
        topic: topic.trim(),
        projectId: selectedProjectId || undefined,
        projectTitle: project?.title || "Independent Episode",
        format,
        targetLength: length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: allReady ? "Audio Ready" : "Failed",
        engine: readySegments.find((segment) => segment.engine)?.engine || "Chatterbox",
        coverImage: selectedCover || automaticCoverFor(`${selectedProjectId || "independent"}-${snapshot.script.title}-${storedEpisodeId}`),
        runtimeSeconds,
        summary: snapshot.script.summary || snapshot.script.outline.slice(0, 2).map((entry) => entry.summary).join(" "),
        outline: snapshot.script.outline,
        segments: snapshot.script.segments,
      });
      setCompletedEpisodeId(storedEpisodeId);

      if (allReady) {
        setGenerationProgress(100);
        setGenerationStage("Episode complete");
        setNotice("Episode ready. The script, every audio section, and the master were saved.");
        trayJob.succeed("Episode complete · audio and transcript saved.");
        window.localStorage.removeItem(ACTIVE_GENERATION_JOB_KEY);
        setActiveBackgroundJobId("");
      } else {
        setGenerationStage("Some sections need retry");
        setNotice("The completed sections were preserved. Use RETRY SECTION only on the failed section.");
        trayJob.fail("Some sections need retry; completed work was preserved.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background episode generation failed.";
      setGenerationStage("Episode generation failed");
      setNotice(message);
      trayJob.fail(message);
    } finally {
      monitoringJobRef.current = "";
      setIsGenerating(false);
    }
  }

  async function prepareEpisode() {
    if (!topic.trim()) {
      setNotice("Enter a Prompt / Focus before generating.");
      return;
    }
    const jiroName = hostNames.jiro.trim();
    const sharpayName = hostNames.sharpay.trim();
    if (!jiroName || !sharpayName || jiroName.toLowerCase() === sharpayName.toLowerCase()) {
      setNotice("Enter two different host names before generating.");
      return;
    }
    for (const [label, settings] of [[jiroName, hostSettings.jiro], [sharpayName, hostSettings.sharpay]] as const) {
      if (REFERENCE_TTS_ENGINES.has(settings.ttsEngine) && !settings.voiceReferenceKey) {
        setNotice(`Upload a clean voice reference for ${label} before using ${settings.ttsEngine}.`);
        return;
      }
    }
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStage("Submitting a durable background job…");
    setNotice("Submitting the episode. You may switch pages after it is accepted.");
    try {
      const response = await fetch("/api/background/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId || undefined,
          episodeTitle: episodeTitle.trim(), topic, format, length, useWebSearch,
          source: buildCompactSourceContext(selectedSources), producerInstructions,
          scriptGuidance, scriptGuidanceName, scriptGuidanceMode, allowVerifiedAdditions,
          jiroBanter, sharpayEnergy, jiroName, sharpayName,
          jiroVoice: hostSettings.jiro.ttsEngine === "groq-orpheus" ? (hostSettings.jiro.orpheusVoice || "daniel") : hostSettings.jiro.voice,
          sharpayVoice: hostSettings.sharpay.ttsEngine === "groq-orpheus" ? (hostSettings.sharpay.orpheusVoice || "hannah") : hostSettings.sharpay.voice,
          jiroProfile: hostSettings.jiro.audioProfile, sharpayProfile: hostSettings.sharpay.audioProfile,
          jiroStyle: hostSettings.jiro.style, sharpayStyle: hostSettings.sharpay.style,
          jiroPace: hostSettings.jiro.pace, sharpayPace: hostSettings.sharpay.pace,
          jiroAccent: hostSettings.jiro.accent, sharpayAccent: hostSettings.sharpay.accent,
          jiroTtsEngine: hostSettings.jiro.ttsEngine, sharpayTtsEngine: hostSettings.sharpay.ttsEngine,
          jiroVoiceReferenceKey: hostSettings.jiro.voiceReferenceKey, sharpayVoiceReferenceKey: hostSettings.sharpay.voiceReferenceKey,
          jiroVoiceReferenceText: hostSettings.jiro.voiceReferenceText, sharpayVoiceReferenceText: hostSettings.sharpay.voiceReferenceText,
        }),
      });
      if (!response.ok) throw new Error(await getFailureMessage(response));
      const accepted = await response.json() as { id: string };
      const storedEpisodeId = `episode-${accepted.id}`;
      const now = new Date().toISOString();
      saveDeepDive({
        id: storedEpisodeId,
        backgroundJobId: accepted.id,
        title: episodeTitle.trim() || topic.trim().slice(0, 90) || "New Deep Dive",
        topic: topic.trim(),
        projectId: selectedProjectId || undefined,
        projectTitle: selectedProject?.title || "Independent Episode",
        format,
        targetLength: length,
        createdAt: now,
        updatedAt: now,
        status: "Submitted",
        progress: 0,
        generationStage: "Queued for background generation",
        coverImage: selectedCover || automaticCoverFor(`${selectedProjectId || "independent"}-${storedEpisodeId}`),
        outline: [],
        segments: [],
      });
      window.localStorage.removeItem(ACTIVE_GENERATION_JOB_KEY);
      setEpisode(null);
      setAudioSegments([]);
      setEpisodeTitle("");
      setTopic("");
      setProducerInstructions("");
      setScriptGuidance("");
      setScriptGuidanceName("");
      setGenerationProgress(0);
      setGenerationStage("Ready to generate your episode");
      setActiveBackgroundJobId("");
      setIsGenerating(false);
      router.push(`/deep-dives/${encodeURIComponent(storedEpisodeId)}`);
    } catch (error) {
      setIsGenerating(false);
      setGenerationStage("Episode generation could not start");
      setNotice(error instanceof Error ? error.message : "Episode generation could not start.");
    }
  }

  async function prepareEpisodeLegacy() {
    if (!topic.trim()) {
      setNotice("Enter a Prompt / Focus before generating.");
      return;
    }
    const jiroName = hostNames.jiro.trim();
    const sharpayName = hostNames.sharpay.trim();
    if (!jiroName || !sharpayName) {
      setNotice("Enter a name for both hosts before generating.");
      return;
    }
    if (jiroName.toLowerCase() === sharpayName.toLowerCase()) {
      setNotice("Use different names for Host 1 and Host 2 so the audio model can preserve speaker assignments.");
      return;
    }
    audioSegments.forEach((segment) => {
      if (segment.audioUrl) URL.revokeObjectURL(segment.audioUrl);
    });
    setEpisode(null);
    setAudioSegments([]);
    setIsGenerating(true);
    setGenerationProgress(2);
    setGenerationStage("Starting episode generation…");
    const job = beginBackgroundJob(
      "Generating Deep Dive",
      "Writing the episode script…",
      selectedProjectId || undefined,
    );
    const reportProgress = (progress: number, detail: string) => {
      const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
      setGenerationProgress(safeProgress);
      setGenerationStage(detail);
      job.update(detail, safeProgress);
    };
    reportProgress(5, "Writing the episode script…");
    setNotice(useWebSearch ? "Writing the episode script with Gemini and checking current facts on the web..." : "Writing the episode script with the selected project sources...");

    try {
      const scriptResponse = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "script",
          episodeTitle: episodeTitle.trim(),
          topic,
          format,
          length,
          useWebSearch,
          source: buildCompactSourceContext(selectedSources),
          producerInstructions,
          scriptGuidance,
          scriptGuidanceName,
          scriptGuidanceMode,
          allowVerifiedAdditions,
          jiroBanter,
          sharpayEnergy,
          jiroName,
          sharpayName,
          jiroProfile: hostSettings.jiro.audioProfile,
          sharpayProfile: hostSettings.sharpay.audioProfile,
          jiroStyle: hostSettings.jiro.style,
          sharpayStyle: hostSettings.sharpay.style,
          jiroPace: hostSettings.jiro.pace,
          sharpayPace: hostSettings.sharpay.pace,
          jiroAccent: hostSettings.jiro.accent,
          sharpayAccent: hostSettings.sharpay.accent,
        }),
      });
      if (!scriptResponse.ok) throw new Error(await getFailureMessage(scriptResponse));

      const generatedEpisode = await scriptResponse.json() as GeneratedEpisode;
      if (episodeTitle.trim()) generatedEpisode.title = episodeTitle.trim();
      else setEpisodeTitle(generatedEpisode.title);
      reportProgress(18, "Script ready. Preparing host audio…");
      setEpisode(generatedEpisode);
      setAudioSegments(generatedEpisode.segments.map((segment) => ({ ...segment, status: "pending" })));

      let completed = 0;
      let completedAudioTurns = 0;
      let generationEngine = "Gemini TTS";
      const audioFailures: string[] = [];
      const completedSegments: Array<{ id: number; title: string; audioUrl: string }> = [];
      const parsedTurns = generatedEpisode.segments.map((segment) => parseDialogueTurns(segment.script, jiroName, sharpayName));
      const totalAudioTurns = parsedTurns.reduce((total, turns) => total + Math.max(1, turns.length), 0);
      const reportAudioTurn = (detail: string) => {
        completedAudioTurns += 1;
        const audioProgress = 18 + Math.round((completedAudioTurns / Math.max(1, totalAudioTurns)) * 72);
        reportProgress(audioProgress, detail);
      };
      for (let index = 0; index < generatedEpisode.segments.length; index += 1) {
        const segment = generatedEpisode.segments[index];
        reportProgress(
          18 + Math.round((completedAudioTurns / Math.max(1, totalAudioTurns)) * 72),
          `Generating audio for segment ${index + 1} of ${generatedEpisode.segments.length}…`,
        );
        setNotice(`Generating Gemini TTS audio for segment ${index + 1} of ${generatedEpisode.segments.length}…`);
        setAudioSegments((current) => current.map((item) => item.id === segment.id ? { ...item, status: "generating", error: undefined } : item));

        try {
          const turns = parsedTurns[index];
          let audioBlob: Blob;
          let engine: AudioSegment["engine"] = "Gemini TTS";
          let fallbackUsed = false;
          if (turns.length >= 2) {
            const parts: Array<{ host: "jiro" | "sharpay"; blob: Blob }> = [];
            for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
              const turn = turns[turnIndex];
              setNotice(`Generating Spatial Stereo dialogue ${turnIndex + 1} of ${turns.length} · segment ${index + 1} of ${generatedEpisode.segments.length}…`);
              const settings = hostSettings[turn.host];
              const turnResponse = await fetch("/api/studio/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "audio-turn",
                  host: turn.host,
                  hostName: hostNames[turn.host],
                  spokenText: turn.text,
                  voice: settings.voice,
                  audioProfile: settings.audioProfile,
                  style: settings.style,
                  pace: settings.pace,
                  accent: settings.accent,
                }),
              });
              if (!turnResponse.ok) throw new Error(await getFailureMessage(turnResponse));
              parts.push({ host: turn.host, blob: await turnResponse.blob() });
              reportAudioTurn(`Rendered voice turn ${completedAudioTurns + 1} of ${totalAudioTurns}…`);
            }
            reportProgress(
              18 + Math.round((completedAudioTurns / Math.max(1, totalAudioTurns)) * 72),
              `Creating the Spatial Stereo mix for segment ${index + 1}…`,
            );
            audioBlob = await renderHostPannedDialogue(parts);
          } else {
            const audioResponse = await fetch("/api/studio/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "audio",
                script: segment.script,
                segmentTitle: segment.title,
                jiroName,
                sharpayName,
                jiroVoice: hostSettings.jiro.voice,
                sharpayVoice: hostSettings.sharpay.voice,
                jiroProfile: hostSettings.jiro.audioProfile,
                sharpayProfile: hostSettings.sharpay.audioProfile,
                jiroStyle: hostSettings.jiro.style,
                sharpayStyle: hostSettings.sharpay.style,
                jiroPace: hostSettings.jiro.pace,
                sharpayPace: hostSettings.sharpay.pace,
                jiroAccent: hostSettings.jiro.accent,
                sharpayAccent: hostSettings.sharpay.accent,
              }),
            });
            if (!audioResponse.ok) throw new Error(await getFailureMessage(audioResponse));
            audioBlob = await audioResponse.blob();
            fallbackUsed = true;
            reportAudioTurn(`Rendered segment ${index + 1} of ${generatedEpisode.segments.length}…`);
          }
          const audioUrl = URL.createObjectURL(audioBlob);
          completedSegments.push({ id: segment.id, title: segment.title, audioUrl });
          generationEngine = engine;
          completed += 1;
          setAudioSegments((current) => current.map((item) => item.id === segment.id ? { ...item, audioUrl, status: "ready", engine, fallbackUsed } : item));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Audio synthesis failed.";
          audioFailures.push(`Segment ${index + 1} (${segment.title}): ${message}`);
          setAudioSegments((current) => current.map((item) => item.id === segment.id ? { ...item, status: "failed", error: message } : item));
        }
      }

      const storedStatus = completed === generatedEpisode.segments.length ? "Audio Ready" : "Failed";
      const storedEpisodeId = `episode-${Date.now()}`;
      let runtimeSeconds: number | undefined;
      if (storedStatus === "Audio Ready") {
        reportProgress(94, "Mastering the saved Spatial Stereo episode…");
        const { renderEpisodeExport } = await import("../../lib/audio-export");
        const master = await renderEpisodeExport({
          title: generatedEpisode.title,
          format: "wav",
          spatialOutput: "spatial-stereo",
          segments: completedSegments,
          musicEnabled: musicMode === "upload" && musicEnabled,
          musicTracks,
          musicCueMode,
          defaultMusicTrackId,
          segmentMusicMap,
          musicVolume: voiceDucking ? Math.max(4, Math.round(musicVolume * 0.72)) : musicVolume,
          autoLoopMusic,
          loopCrossfade,
          musicPlacement,
          introOutroBoost,
          onProgress: (message) => reportProgress(97, message),
        });
        reportProgress(98, "Saving the finished episode audio…");
        await saveEpisodeAudio(storedEpisodeId, master.blob);
        const durationContext = new AudioContext();
        try {
          const decoded = await durationContext.decodeAudioData(await master.blob.arrayBuffer());
          runtimeSeconds = decoded.duration;
        } finally {
          await durationContext.close();
        }
      }
      saveDeepDive({
        id: storedEpisodeId,
        title: generatedEpisode.title,
        topic: topic.trim(),
        projectId: selectedProjectId || undefined,
        projectTitle: selectedProject?.title || "Independent Episode",
        format,
        targetLength: length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: storedStatus,
        engine: generationEngine,
        coverImage: selectedCover || automaticCoverFor(`${selectedProjectId || "independent"}-${generatedEpisode.title}-${storedEpisodeId}`),
        runtimeSeconds,
        summary: generatedEpisode.summary || generatedEpisode.outline.slice(0, 2).map((entry) => entry.summary).join(" "),
        outline: generatedEpisode.outline,
        segments: generatedEpisode.segments,
      });
      setCompletedEpisodeId(storedEpisodeId);

      if (completed === generatedEpisode.segments.length) {
        setGenerationProgress(100);
        setGenerationStage("Episode complete");
        setNotice(`Episode ready — ${completed} audio segment${completed === 1 ? "" : "s"} generated with ${generationEngine}.`);
        job.succeed(`Episode ready · ${completed} audio segment${completed === 1 ? "" : "s"}.`);
      } else if (completed > 0) {
        const failureDetail = audioFailures[0] ? ` ${audioFailures[0]}` : "";
        setGenerationStage("Episode generation stopped with incomplete audio");
        setNotice(`Episode script is ready, but only ${completed} of ${generatedEpisode.segments.length} audio segments completed.${failureDetail}`);
        job.fail(`${completed} of ${generatedEpisode.segments.length} segments completed.${failureDetail}`);
      } else {
        throw new Error(audioFailures[0] || "The script was created, but Gemini did not return audio. Please try generating again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Episode generation failed. Please try again.";
      setGenerationStage("Episode generation failed");
      setNotice(message);
      job.fail(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function retryAudioSegment(segmentId: number) {
    const segment = audioSegments.find((item) => item.id === segmentId);
    if (!segment || segment.status !== "failed" || retryingSegmentId !== null) return;
    if (activeBackgroundJobId) {
      const job = beginBackgroundJob(
        `Retrying section ${segmentId}`,
        `Re-queuing “${segment.title}” in the background…`,
        selectedProjectId || undefined,
      );
      setRetryingSegmentId(segmentId);
      setNotice(`Retrying section ${segmentId}. You may switch pages while it runs.`);
      setAudioSegments((current) => current.map((item) => item.id === segmentId
        ? { ...item, status: "generating", error: undefined }
        : item));
      try {
        const response = await fetch(
          `/api/background/jobs/${encodeURIComponent(activeBackgroundJobId)}/segments/${segmentId}/retry`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error(await getFailureMessage(response));
        job.update(`Section ${segmentId} queued for background retry…`, 10);
        setRetryingSegmentId(null);
        await monitorBackgroundJob(activeBackgroundJobId, true);
        job.succeed(`Section ${segmentId} retry finished.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "This section could not be retried.";
        setAudioSegments((current) => current.map((item) => item.id === segmentId
          ? { ...item, status: "failed", error: message }
          : item));
        setNotice(message);
        job.fail(message);
      } finally {
        setRetryingSegmentId(null);
      }
      return;
    }
    const jiroName = hostNames.jiro.trim() || "Jiro";
    const sharpayName = hostNames.sharpay.trim() || "Sharpay";
    const job = beginBackgroundJob(
      `Retrying section ${segmentId}`,
      `Regenerating “${segment.title}”…`,
      selectedProjectId || undefined,
    );
    setRetryingSegmentId(segmentId);
    setNotice(`Retrying audio for section ${segmentId}…`);
    setAudioSegments((current) => current.map((item) => item.id === segmentId ? { ...item, status: "generating", error: undefined } : item));

    try {
      const turns = parseDialogueTurns(segment.script, jiroName, sharpayName);
      let audioBlob: Blob;
      let fallbackUsed = false;
      if (turns.length >= 2) {
        const parts: Array<{ host: "jiro" | "sharpay"; blob: Blob }> = [];
        for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
          const turn = turns[turnIndex];
          job.update(`Rendering voice turn ${turnIndex + 1} of ${turns.length}…`, Math.round(((turnIndex + 1) / turns.length) * 85));
          const settings = hostSettings[turn.host];
          const response = await fetch("/api/studio/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "audio-turn",
              host: turn.host,
              hostName: hostNames[turn.host],
              spokenText: turn.text,
              voice: settings.voice,
              audioProfile: settings.audioProfile,
              style: settings.style,
              pace: settings.pace,
              accent: settings.accent,
            }),
          });
          if (!response.ok) throw new Error(await getFailureMessage(response));
          parts.push({ host: turn.host, blob: await response.blob() });
        }
        audioBlob = await renderHostPannedDialogue(parts);
      } else {
        const response = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "audio",
            script: segment.script,
            segmentTitle: segment.title,
            jiroName,
            sharpayName,
            jiroVoice: hostSettings.jiro.voice,
            sharpayVoice: hostSettings.sharpay.voice,
            jiroProfile: hostSettings.jiro.audioProfile,
            sharpayProfile: hostSettings.sharpay.audioProfile,
            jiroStyle: hostSettings.jiro.style,
            sharpayStyle: hostSettings.sharpay.style,
            jiroPace: hostSettings.jiro.pace,
            sharpayPace: hostSettings.sharpay.pace,
            jiroAccent: hostSettings.jiro.accent,
            sharpayAccent: hostSettings.sharpay.accent,
          }),
        });
        if (!response.ok) throw new Error(await getFailureMessage(response));
        audioBlob = await response.blob();
        fallbackUsed = true;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const nextSegments = audioSegments.map((item) => item.id === segmentId
        ? { ...item, audioUrl, status: "ready" as const, engine: "Gemini TTS" as const, fallbackUsed, error: undefined }
        : item);
      setAudioSegments(nextSegments);
      job.succeed(`Section ${segmentId} audio is ready.`);
      setNotice(`Section ${segmentId} regenerated successfully.`);

      if (completedEpisodeId && nextSegments.every((item) => item.status === "ready" && item.audioUrl)) {
        const { renderEpisodeExport } = await import("../../lib/audio-export");
        const master = await renderEpisodeExport({
          title: episode?.title || "DeepCast Episode",
          format: "wav",
          spatialOutput: "spatial-stereo",
          segments: nextSegments.map((item) => ({ id: item.id, title: item.title, audioUrl: item.audioUrl! })),
          musicEnabled: musicMode === "upload" && musicEnabled,
          musicTracks,
          musicCueMode,
          defaultMusicTrackId,
          segmentMusicMap,
          musicVolume: voiceDucking ? Math.max(4, Math.round(musicVolume * 0.72)) : musicVolume,
          autoLoopMusic,
          loopCrossfade,
          musicPlacement,
          introOutroBoost,
        });
        await saveEpisodeAudio(completedEpisodeId, master.blob);
        const stored = readDeepDives().find((item) => item.id === completedEpisodeId);
        if (stored) saveDeepDive({ ...stored, status: "Audio Ready", updatedAt: new Date().toISOString() });
        setNotice("All sections are ready and the complete episode was remastered.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Section retry failed.";
      setAudioSegments((current) => current.map((item) => item.id === segmentId ? { ...item, status: "failed", error: message } : item));
      job.fail(message);
      setNotice(`Section ${segmentId} retry failed: ${message}`);
    } finally {
      setRetryingSegmentId(null);
    }
  }

  async function retryAllFailedSegments() {
    const failedIds = audioSegments.filter((item) => item.status === "failed").map((item) => item.id);
    if (!activeBackgroundJobId || !failedIds.length || retryingSegmentId !== null) return;
    const job = beginBackgroundJob(
      "Retrying failed sections",
      `Re-queuing ${failedIds.length} failed audio sections…`,
      selectedProjectId || undefined,
      `retry-all-${activeBackgroundJobId}`,
    );
    setRetryingSegmentId(-1);
    setNotice(`Retrying ${failedIds.length} failed sections. Completed audio will not be regenerated.`);
    try {
      for (let index = 0; index < failedIds.length; index += 1) {
        const segmentId = failedIds[index];
        job.update(`Re-queuing section ${index + 1} of ${failedIds.length}…`, Math.round(((index + 1) / failedIds.length) * 15));
        const response = await fetch(
          `/api/background/jobs/${encodeURIComponent(activeBackgroundJobId)}/segments/${segmentId}/retry`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error(await getFailureMessage(response));
      }
      setAudioSegments((current) => current.map((item) => failedIds.includes(item.id)
        ? { ...item, status: "pending", error: undefined }
        : item));
      setRetryingSegmentId(null);
      await monitorBackgroundJob(activeBackgroundJobId, true);
      job.succeed("Failed sections were reprocessed; completed sections were preserved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The failed sections could not be re-queued.";
      setNotice(message);
      job.fail(message);
    } finally {
      setRetryingSegmentId(null);
    }
  }

  return (
    <main className="studio-page">
      <div className="studio-container approved-studio-container">
        {selectedProject && <ProjectWorkspaceHeader project={selectedProject} active="studio" sourceCount={projectSources.length} />}
        <header className="approved-studio-header">
          <div>
            <Link href={selectedProject ? `/projects/${encodeURIComponent(selectedProject.id)}` : "/deep-dives"} className="back-dashboard">← {selectedProject ? "BACK TO PROJECT" : "BACK TO DEEP DIVES"}</Link>
            <h1><span aria-hidden="true">✦</span> DEEPCAST STUDIO</h1>
            <p>Host your own show. Script, synthesize, and listen to multi-speaker deep dives.</p>
          </div>
          <button
            type="button"
            className={`drive-connect ${driveConnection === "connected" ? "connected" : ""}`}
            onClick={connectGoogleDrive}
            disabled={driveConnection === "connecting"}
          >
            {driveConnection === "connected" ? "✓ Google Drive Connected" : driveConnection === "connecting" ? "Connecting Google Drive..." : "▣ Connect Google Drive"}
          </button>
        </header>

        <div className="approved-studio-layout">
          <div className="approved-studio-controls">
            <section className="approved-studio-panel">
              <div className="approved-panel-title"><span aria-hidden="true">⚙</span><h2>CUSTOMIZE YOUR DEEP DIVE EPISODE</h2></div>

              <label className="approved-field-label" htmlFor="episode-title">Episode Title</label>
              <input id="episode-title" className="approved-studio-input" value={episodeTitle} onChange={(event) => setEpisodeTitle(event.target.value)} placeholder="Optional — DeepCast can create the title" maxLength={120} />

              <label className="approved-field-label" htmlFor="focus">Prompt / Focus</label>
              <textarea id="focus" className="approved-studio-textarea prompt-focus-input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What should the AI hosts focus on in this episode?" />

              <div className="script-guidance-block">
                <div className="script-guidance-heading">
                  <div>
                    <span className="approved-field-label">Script / Transcript Guidance (Optional)</span>
                    <p>Paste or upload a ready script. Your prompt still sets the episode focus; selected sources and optional web search verify claims and can supply missing facts.</p>
                  </div>
                  <label className="script-upload-button">
                    ＋ UPLOAD TXT / MD
                    <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void handleScriptGuidanceUpload(event)} />
                  </label>
                </div>
                {scriptGuidanceName && <div className="script-guidance-file">✓ {scriptGuidanceName}</div>}
                <textarea
                  className="approved-studio-textarea script-guidance-input"
                  value={scriptGuidance}
                  onChange={(event) => { setScriptGuidance(event.target.value); if (scriptGuidanceName) setScriptGuidanceName(""); }}
                  placeholder="Paste a finished script, transcript, rundown, or host dialogue here…"
                />
                <div className="script-guidance-options">
                  <div className="script-guidance-modes" role="group" aria-label="Script guidance mode">
                    <button type="button" className={scriptGuidanceMode === "guided" ? "active" : ""} onClick={() => setScriptGuidanceMode("guided")}>GUIDED ADAPTATION</button>
                    <button type="button" className={scriptGuidanceMode === "close" ? "active" : ""} onClick={() => setScriptGuidanceMode("close")}>FOLLOW CLOSELY</button>
                  </div>
                  <button
                    type="button"
                    className={`script-verified-toggle ${allowVerifiedAdditions ? "active" : ""}`}
                    onClick={() => setAllowVerifiedAdditions((current) => !current)}
                    aria-pressed={allowVerifiedAdditions}
                  >
                    <span>ALLOW VERIFIED ADDITIONS</span><i aria-hidden="true"><b /></i>
                  </button>
                </div>
              </div>

              <label className="approved-field-label" htmlFor="format">Episode Format</label>
              <select id="format" className="approved-studio-input" value={format} onChange={(event) => changeFormat(event.target.value as EpisodeFormat)}>
                {FORMAT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label} — {option.description}</option>)}
              </select>

              <label className="approved-field-label" htmlFor="length">Runtime</label>
              <select id="length" className="approved-studio-input" value={length} onChange={(event) => setLength(event.target.value)}>
                {LENGTH_OPTIONS[format].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>

              <label className="approved-field-label" htmlFor="studio-project">Project</label>
              <select id="studio-project" className="approved-studio-input" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                <option value="">No project — episode only</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}
              </select>

              <div className="approved-field-label" id="project-sources">Project Sources</div>
              <button type="button" className="project-sources-button" onClick={() => setSourceSelectorOpen(true)}>
                <span><strong>{projectSources.length} {projectSources.length === 1 ? "SOURCE" : "SOURCES"} IN PROJECT</strong><small>{selectedSources.length} selected for this episode</small></span>
                <i aria-hidden="true">›</i>
              </button>
              <div className="source-management-actions">
                <button type="button" onClick={() => setSourceEditorOpen(true)} disabled={!selectedProjectId}>¶ PASTE SOURCE MATERIAL</button>
                <button type="button" onClick={() => void openDriveSelector()} disabled={!selectedProjectId || driveLoading}>▣ ADD FROM GOOGLE DRIVE</button>
              </div>
              {!selectedProjectId && <p className="field-help">This episode will stay independent. Create or select a project to attach reusable sources.</p>}

              <div className="approved-field-label">Research Materials & Sources</div>
              <button type="button" className={`web-search-option ${useWebSearch ? "active" : ""}`} onClick={() => setUseWebSearch((current) => !current)} aria-pressed={useWebSearch}>
                <span aria-hidden="true">⌕</span>
                <span><strong>WEB SEARCH</strong><small>Episode-only research · not added to the project</small></span>
                <i className="toggle-indicator" aria-hidden="true"><b /></i>
              </button>

            </section>

            <SpeakerSettings
              activeHost={activeHost}
              hostNames={hostNames}
              hostSettings={hostSettings}
              jiroBanter={jiroBanter}
              sharpayEnergy={sharpayEnergy}
              voiceSearch={voiceSearch}
              previewingVoice={previewingVoice}
              previewAudioUrl={previewAudioUrl}
              previewLabel={previewLabel}
              onActiveHostChange={(host) => { setActiveHost(host); setVoiceSearch(""); }}
              onHostNameChange={updateHostName}
              onHostSettingsChange={updateHostSettings}
              onJiroBanterChange={setJiroBanter}
              onSharpayEnergyChange={setSharpayEnergy}
              onVoiceSearchChange={setVoiceSearch}
              onPreviewVoice={previewVoice}
            />

            <section className="approved-studio-panel producer-panel">
              <div className="approved-panel-title"><span aria-hidden="true">✎</span><h2>PRODUCER INSTRUCTIONS</h2></div>
              <label className="approved-field-label" htmlFor="instructions">Producer Instructions (Optional)</label>
              <textarea id="instructions" className="approved-studio-textarea producer-instructions-input" value={producerInstructions} onChange={(event) => setProducerInstructions(event.target.value)} placeholder="e.g. Prioritize the timeline, challenge weak claims, keep the tone witty, and avoid speculation..." />
              <p className="field-help">These instructions directly guide the script’s angle, tone, priorities, exclusions, and host behavior.</p>
            </section>

            <section className="approved-studio-panel studio-music-settings">
              <div className="approved-panel-title"><span aria-hidden="true">♫</span><h2>BACKGROUND MUSIC</h2></div>
              <div className="studio-mode-tabs" role="group" aria-label="Background music mode">
                {([["none", "NONE"], ["upload", "UPLOAD AUDIO"], ["generate", "GENERATE INSTRUMENTAL"]] as Array<[MusicMode, string]>).map(([mode, label]) => <button type="button" key={mode} className={musicMode === mode ? "active" : ""} onClick={() => { setMusicMode(mode); setMusicEnabled(mode === "upload" && musicTracks.length > 0); }}>{label}</button>)}
              </div>
              {musicMode === "upload" && <>
                <label className="music-upload-button">＋ UPLOAD MUSIC OR INSTRUMENTAL<input type="file" accept=".mp3,.wav,.m4a,.aac,audio/*" multiple onChange={handleMusicUpload} /></label>
                {musicTracks.length > 0 && <div className="studio-uploaded-tracks" aria-label="Uploaded background tracks">
                  {musicTracks.map((track) => <article key={track.id} className={defaultMusicTrackId === track.id ? "active" : ""}>
                    <label>
                      <input type="radio" name="background-track" checked={defaultMusicTrackId === track.id} onChange={() => setDefaultMusicTrackId(track.id)} />
                      <span><strong>{track.name}</strong><small>{(track.size / 1024 / 1024).toFixed(1)} MB · READY TO USE</small></span>
                    </label>
                    <audio controls preload="metadata" src={track.url} />
                    <button type="button" onClick={() => removeMusicTrack(track.id)} aria-label={`Remove ${track.name}`}>×</button>
                  </article>)}
                </div>}
                <div className="studio-toggle-grid">
                  <label><span>AUTO LOOP</span><button type="button" className={`music-toggle ${autoLoopMusic ? "active" : ""}`} onClick={() => setAutoLoopMusic((value) => !value)} aria-pressed={autoLoopMusic}><i /></button></label>
                  <label><span>VOICE DUCKING</span><button type="button" className={`music-toggle ${voiceDucking ? "active" : ""}`} onClick={() => setVoiceDucking((value) => !value)} aria-pressed={voiceDucking}><i /></button></label>
                  <label><span>INTRO / OUTRO BOOST</span><button type="button" className={`music-toggle ${introOutroBoost ? "active" : ""}`} onClick={() => setIntroOutroBoost((value) => !value)} aria-pressed={introOutroBoost}><i /></button></label>
                </div>
                <div className="music-settings-grid">
                  <label><span>PLACEMENT</span><select value={musicPlacement} onChange={(event) => setMusicPlacement(event.target.value as "full" | "intro-outro")}><option value="full">Full episode</option><option value="intro-outro">Intro / outro only</option></select></label>
                  <label><span>BACKGROUND VOLUME · {musicVolume}%</span><input type="range" min="4" max="35" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} /></label>
                  <label><span>LOOP CROSSFADE · {loopCrossfade.toFixed(1)}s</span><input type="range" min="0" max="2" step=".1" value={loopCrossfade} onChange={(event) => setLoopCrossfade(Number(event.target.value))} /></label>
                </div>
              </>}
              {musicMode === "generate" && <div className="studio-provider-unavailable"><strong>INSTRUMENTAL GENERATION IS NOT CONNECTED YET</strong><p>Mood, energy, style prompts, three choices, preview, regenerate, and select will unlock after a supported music-generation provider is connected. No fake generation request will be sent.</p><div><span>POP</span><span>DRAMATIC</span><span>GLOSSY</span><span>DARK</span><span>CAMPY</span><span>CHILL</span><span>INVESTIGATIVE</span></div></div>}
              {musicMode === "none" && <p className="field-help">No background music will be mixed into this episode.</p>}
            </section>

            <section className="approved-studio-panel episode-cover-settings">
              <div className="approved-panel-title"><span aria-hidden="true">▣</span><h2>EPISODE COVER ART</h2></div>
              <div className="studio-mode-tabs" role="group" aria-label="Episode cover mode">
                {([["auto", "AUTO-GENERATE"], ["upload", "UPLOAD IMAGE"], ["project", "USE PROJECT COVER"], ["none", "NO COVER"]] as Array<[CoverMode, string]>).map(([mode, label]) => <button type="button" key={mode} className={coverMode === mode ? "active" : ""} disabled={mode === "project" && !selectedProject} onClick={() => setCoverMode(mode)}>{label}</button>)}
              </div>
              {coverMode === "auto" && <><p className="field-help">Four responsive DeepCast cover choices are selected from the episode title, prompt, format, and project context.</p><div className="episode-cover-grid">{AUTO_COVER_OPTIONS.map((cover, index) => <button type="button" key={cover.id} className={selectedAutoCover === cover.src ? "active" : ""} onClick={() => setSelectedAutoCover(cover.src)}><img src={cover.src} alt={cover.label} /><span>OPTION {index + 1}</span></button>)}</div></>}
              {coverMode === "upload" && <><label className="music-upload-button">＋ {uploadedCoverName ? "REPLACE COVER IMAGE" : "UPLOAD COVER IMAGE"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleEpisodeCoverUpload(event)} /></label>{uploadedCover && <img className="uploaded-cover-preview" src={uploadedCover} alt="Uploaded episode cover preview" />}</>}
              {coverMode === "project" && <p className="field-help">The selected project’s responsive header artwork will be used for this episode.</p>}
              {coverMode === "none" && <p className="field-help">This episode will use the standard DeepCast player background without artwork.</p>}
            </section>

            <section className="approved-studio-panel studio-output-settings">
              <div className="approved-panel-title"><span aria-hidden="true">◉</span><h2>AUDIO OUTPUT / SPATIAL MIX</h2></div>
              <div className="export-settings-grid">
                <label><span>DOWNLOAD FORMAT</span><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="wav">WAV · 48 kHz lossless PCM</option><option value="m4a" disabled={spatialOutput === "surround-5.1"}>M4A · AAC 256 kbps</option><option value="mp3" disabled={spatialOutput === "surround-5.1"}>MP3 · 320 kbps</option></select></label>
                <label><span>AUDIO OUTPUT</span><select value={spatialOutput} onChange={(event) => { const output = event.target.value as SpatialOutput; setSpatialOutput(output); if (output === "surround-5.1") setExportFormat("wav"); }}><option value="spatial-stereo">Spatial Stereo Mix</option><option value="stereo">Standard Stereo</option><option value="surround-5.1">5.1 Surround WAV</option></select></label>
              </div>
              <p className="field-help">Spatial Stereo places Jiro toward the left, Sharpay toward the right, and background music in the center. It is not an encoded Dolby Atmos master.</p>
            </section>

            <button className="approved-generate-button" type="button" onClick={prepareEpisode} disabled={isGenerating}><span>✦</span> {isGenerating ? "GENERATING EPISODE" : "GENERATE EPISODE"}</button>
            {notice && <div className="studio-notice" role="status">{notice}</div>}
          </div>

          <details id="studio-master-console" className="approved-master-console" open>
            <summary className="approved-console-header"><div><h2>STUDIO MASTER CONSOLE</h2><p>Live output, progress, script, and audio review · ENGINE: {activeGenerationEngine}</p></div><span>{isGenerating ? `${generationProgress}%` : episode ? "COMPLETE" : "READY"}</span></summary>
            <div className="console-status"><i /> <strong>{isGenerating ? generationStage : notice || "Ready to generate your episode"}</strong></div>
            {isGenerating && (
              <div className="episode-generation-progress" role="progressbar" aria-label="Episode generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress}>
                <div><strong>{generationProgress}%</strong><span>{generationStage}</span></div>
                <i><span style={{ width: `${generationProgress}%` }} /></i>
              </div>
            )}
            <details className="approved-console-section" open>
              <summary>SHOW OUTLINE & SEGMENTS</summary>
              {episode ? (
                <div className="generated-outline">
                  <h3>{episode.title}</h3>
                  {episode.outline.map((item) => (
                    <div className="outline-item" key={`${item.number}-${item.title}`}><span>{String(item.number).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.summary}</p></div></div>
                  ))}
                </div>
              ) : <div className="outline-placeholder"><span>01</span><p>Your generated outline will appear here.</p></div>}
            </details>
            <details className="approved-console-section" open>
              <summary>GENERATED LIVE SCRIPT</summary>
              {episode ? (
                <div className="generated-script">
                  {episode.segments.map((segment) => <details key={segment.id}><summary>{String(segment.id).padStart(2, "0")} · {segment.title}</summary><pre>{segment.script}</pre></details>)}
                </div>
              ) : <div className="approved-script-placeholder">The live {hostNames.jiro.trim() || "Jiro"} and {hostNames.sharpay.trim() || "Sharpay"} script will appear here as each segment is generated.</div>}
            </details>
            <details className="approved-console-section" open>
              <summary>AUDIO EPISODE MIXER</summary>
              {audioSegments.length ? (
                <div className="generated-audio-list">
                  {audioSegments.some((segment) => segment.status === "failed") && activeBackgroundJobId ? (
                    <button type="button" className="retry-all-sections" onClick={() => void retryAllFailedSegments()} disabled={retryingSegmentId !== null}>
                      {retryingSegmentId === -1 ? "RETRYING FAILED SECTIONS…" : `↻ RETRY ALL ${audioSegments.filter((segment) => segment.status === "failed").length} FAILED SECTIONS`}
                    </button>
                  ) : null}
                  {audioSegments.map((segment) => (
                    <div className={`generated-audio-track ${segment.status}`} key={segment.id}>
                      <div><span>{String(segment.id).padStart(2, "0")}</span><strong>{segment.title}</strong><small>{segment.status === "generating" ? "Generating Gemini TTS audio…" : segment.engine || segment.status}</small></div>
                      {segment.audioUrl ? <><audio controls preload="metadata" src={segment.audioUrl} onPlay={() => playBackgroundMusic(segment.id)} onPause={pauseBackgroundMusic} onEnded={stopBackgroundMusic} />{musicEnabled && musicCueMode === "per-segment" && musicTracks.length > 0 && <label className="segment-music-select"><span>MUSIC CUE</span><select value={segmentMusicMap[segment.id] || ""} onChange={(event) => setSegmentMusicMap((current) => ({ ...current, [segment.id]: event.target.value }))}><option value="">No music for this segment</option>{musicTracks.map((track) => <option value={track.id} key={track.id}>{track.name}</option>)}</select></label>}<a href={segment.audioUrl} download={`DeepCast-${String(segment.id).padStart(2, "0")}.wav`}>Download Voice-Only WAV</a></> : segment.error ? <div className="segment-failure"><p>{segment.error}</p><button type="button" onClick={() => void retryAudioSegment(segment.id)} disabled={retryingSegmentId !== null}>{retryingSegmentId === segment.id ? "RETRYING SECTION…" : "↻ RETRY SECTION"}</button></div> : null}
                    </div>
                  ))}
                </div>
              ) : <div className="approved-audio-placeholder">Generate an episode to unlock the audio mixer.</div>}
            </details>
            <details className="approved-console-section music-console-section">
              <summary>BACKGROUND MUSIC & TRACK CUES</summary>
              <div className="music-master-row">
                <div><strong>PLAY MUSIC UNDER THE EPISODE</strong><span>For this Studio session</span></div>
                <button type="button" className={`music-toggle ${musicEnabled ? "active" : ""}`} onClick={() => { if (musicEnabled) pauseBackgroundMusic(); setMusicEnabled((current) => !current); }} aria-pressed={musicEnabled} disabled={!musicTracks.length}><i /></button>
              </div>
              <label className="music-upload-button">＋ ADD MUSIC OR SONGS<input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/aac" multiple onChange={handleMusicUpload} /></label>
              {musicTracks.length > 0 && <>
                <div className="music-settings-grid">
                  <label><span>CUE MODE</span><select value={musicCueMode} onChange={(event) => setMusicCueMode(event.target.value as MusicCueMode)}><option value="continuous">Continuous background bed</option><option value="per-segment">Different track per segment</option></select></label>
                  <label><span>MUSIC VOLUME · {musicVolume}%</span><input type="range" min="4" max="35" value={musicVolume} onChange={(event) => { const nextVolume = Number(event.target.value); setMusicVolume(nextVolume); if (backgroundAudioRef.current) backgroundAudioRef.current.volume = nextVolume / 100; }} /></label>
                </div>
                <div className="music-track-list">
                  {musicTracks.map((track) => <div className="music-track-item" key={track.id}><label><input type="radio" name="default-music-track" checked={defaultMusicTrackId === track.id} onChange={() => setDefaultMusicTrackId(track.id)} disabled={musicCueMode !== "continuous"} /><span><strong>{track.name}</strong><small>{musicCueMode === "continuous" && defaultMusicTrackId === track.id ? "DEFAULT BACKGROUND TRACK" : "AVAILABLE MUSIC"}</small></span></label><button type="button" onClick={() => removeMusicTrack(track.id)} aria-label={`Remove ${track.name}`}>×</button></div>)}
                </div>
              </>}
              <p className="music-rights-note">Use only music you own or have permission to use. Enabled music is included in complete episode exports. Individual segment downloads remain voice-only.</p>
              <audio ref={backgroundAudioRef} className="background-music-player" aria-hidden="true" />
            </details>
            <details className="approved-console-section episode-export-section">
              <summary>EPISODE EXPORT</summary>
              <div className="export-settings-grid">
                <label><span>DOWNLOAD FORMAT</span><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="wav">WAV · Lossless PCM</option><option value="mp3" disabled={spatialOutput === "surround-5.1"}>MP3 · Stereo</option><option value="m4a" disabled={spatialOutput === "surround-5.1"}>M4A · AAC Stereo</option></select></label>
                <label><span>AUDIO OUTPUT</span><select value={spatialOutput} onChange={(event) => { const output = event.target.value as SpatialOutput; setSpatialOutput(output); if (output === "surround-5.1") setExportFormat("wav"); }}><option value="spatial-stereo">Spatial Stereo Mix</option><option value="stereo">Standard Stereo</option><option value="surround-5.1">5.1 Surround WAV</option></select></label>
              </div>
              <p className="export-explanation">{spatialOutput === "spatial-stereo" ? "Exports Jiro toward the left, Sharpay toward the right, and enabled background music in the center. This is a binaural-friendly stereo mix, not encoded Dolby Atmos." : spatialOutput === "stereo" ? "Exports a complete two-channel stereo episode with enabled background music and track cues." : "Exports a 48 kHz, six-channel 5.1 Surround WAV derived from the Spatial Stereo Mix."}</p>
              <button type="button" className="episode-export-button" onClick={() => void exportEpisode()} disabled={isExporting || !episode || audioSegments.some((segment) => segment.status !== "ready")}>{isExporting ? "EXPORTING EPISODE…" : `DOWNLOAD COMPLETE ${exportFormat.toUpperCase()}`}</button>
            </details>
          </details>
        </div>
      </div>

      {sourceSelectorOpen && (
        <div className="modal-scrim source-selector-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceSelectorOpen(false); }}>
          <section className="source-selector-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="source-selector-title">
            <div className="source-selector-heading">
              <div><span>PROJECT CONTEXT</span><h2 id="source-selector-title">Select Sources</h2><p>Choose which attached project sources the AI hosts may use for this episode.</p></div>
              <button type="button" onClick={() => setSourceSelectorOpen(false)} aria-label="Close source selector">×</button>
            </div>

            <div className="source-selector-toolbar">
              <strong>{projectSources.length} {projectSources.length === 1 ? "source" : "sources"} available</strong>
              <div><button type="button" onClick={() => setSelectedSourceIds(new Set(projectSources.map((source) => source.id)))} disabled={projectSources.length === 0}>Select All</button><button type="button" onClick={() => setSelectedSourceIds(new Set())} disabled={selectedSources.length === 0}>Clear All</button></div>
            </div>

            <div className="source-selector-list">
              {projectSources.length ? projectSources.map((source) => {
                const selected = selectedSourceIds.has(source.id);
                return (
                  <div className={`source-selector-item ${selected ? "selected" : ""}`} key={source.id}>
                    <label>
                      <input type="checkbox" checked={selected} onChange={() => toggleProjectSource(source.id)} />
                      <span aria-hidden="true">{selected ? "✓" : ""}</span>
                      <div><strong>{source.title}</strong><p>{source.kind} · {source.detail}</p></div>
                    </label>
                    <button type="button" className="source-remove-button" onClick={() => removeProjectSource(source.id)} aria-label={`Remove ${source.title} from project`}>×</button>
                  </div>
                );
              }) : (
                <div className="source-selector-empty"><strong>NO SOURCE RECORDS ATTACHED YET.</strong><p>Paste source material into this project or import a supported file from Google Drive.</p></div>
              )}
            </div>

            <div className="source-selector-actions"><span>{selectedSources.length} selected</span><button type="button" onClick={() => setSourceSelectorOpen(false)}>Use Selected Sources</button></div>
          </section>
        </div>
      )}

      {sourceEditorOpen && (
        <div className="modal-scrim source-selector-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceEditorOpen(false); }}>
          <section className="new-project-modal source-editor-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="studio-add-source-title">
            <div className="new-project-modal-heading"><div><span>PROJECT SOURCE</span><h2 id="studio-add-source-title">PASTE SOURCE MATERIAL</h2><p>Save reusable context to {selectedProject?.title || "this project"} without creating a separate source name.</p></div><button type="button" className="modal-close" onClick={() => setSourceEditorOpen(false)} aria-label="Close paste source material">×</button></div>
            <form className="new-project-form" onSubmit={addManualProjectSource}><label htmlFor="studio-source-content">SOURCE MATERIAL <em>Required</em></label><textarea id="studio-source-content" value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} placeholder="Paste research, notes, a transcript, or other source material." maxLength={120000} autoFocus required /><p className="source-title-note">A display label is created automatically from the first line. No source-name field is required.</p><div className="new-project-actions"><button type="button" className="modal-cancel" onClick={() => setSourceEditorOpen(false)}>CANCEL</button><button type="submit" className="modal-create" disabled={!sourceContent.trim()}>SAVE SOURCE MATERIAL</button></div></form>
          </section>
        </div>
      )}

      {driveSelectorOpen && (
        <div className="modal-scrim source-selector-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDriveSelectorOpen(false); }}>
          <section className="source-selector-modal drive-selector-modal glass-wrapper" role="dialog" aria-modal="true" aria-labelledby="drive-selector-title">
            <div className="source-selector-heading"><div><span>GOOGLE DRIVE</span><h2 id="drive-selector-title">SELECT A FILE</h2><p>Import supported text content as a persistent source for {selectedProject?.title || "this project"}.</p></div><button type="button" onClick={() => setDriveSelectorOpen(false)} aria-label="Close Google Drive selector">×</button></div>
            <div className="drive-selector-search"><label htmlFor="drive-file-search">SEARCH DRIVE FILES</label><input id="drive-file-search" type="search" value={driveSearch} onChange={(event) => setDriveSearch(event.target.value)} placeholder="Search the latest files…" /></div>
            <div className="drive-file-list">
              {driveLoading && !driveFiles.length ? <div className="source-selector-empty"><strong>LOADING GOOGLE DRIVE…</strong></div> : filteredDriveFiles.length ? filteredDriveFiles.map((file) => { const supported = driveFileSupported(file); return <button type="button" className="drive-file-item" key={file.id} onClick={() => void addDriveFile(file)} disabled={!supported || driveLoading}><span aria-hidden="true">▣</span><div><strong>{file.name}</strong><small>{supported ? "READY TO IMPORT" : "UNSUPPORTED FILE TYPE"}{file.modifiedTime ? ` · ${new Date(file.modifiedTime).toLocaleDateString()}` : ""}</small></div><i aria-hidden="true">{supported ? "+" : "—"}</i></button>; }) : <div className="source-selector-empty"><strong>NO MATCHING FILES</strong><p>Try another search or add a Google Doc, Sheet, TXT, CSV, JSON, or XML file to Drive.</p></div>}
            </div>
            <div className="source-selector-actions"><span>Supported: Google Docs, Sheets, TXT, CSV, JSON, XML</span><button type="button" onClick={() => setDriveSelectorOpen(false)}>CLOSE</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
