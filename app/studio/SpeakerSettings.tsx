"use client";

import { useState } from "react";
import type { TtsVoiceName } from "../../lib/tts-voices";

export type HostId = "jiro" | "sharpay";
export type DeepCastTtsEngine = "chatterbox-nano" | "chatterbox-turbo" | "f5-tts" | "fish-s2" | "dia2" | "groq-orpheus" | "gemini";
export type OrpheusVoiceName = "autumn" | "diana" | "hannah" | "austin" | "daniel" | "troy";

export type HostVoiceSettings = {
  voice: TtsVoiceName;
  audioProfile: string;
  style: string;
  pace: string;
  accent: string;
  ttsEngine: DeepCastTtsEngine;
  orpheusVoice?: OrpheusVoiceName;
  voiceReferenceKey?: string;
  voiceReferenceName?: string;
  voiceReferenceText?: string;
};

type SpeakerSettingsProps = {
  activeHost: HostId;
  hostNames: Record<HostId, string>;
  hostSettings: Record<HostId, HostVoiceSettings>;
  jiroBanter: number;
  sharpayEnergy: number;
  voiceSearch: string;
  previewingVoice: string | null;
  previewAudioUrl: string;
  previewLabel: string;
  onActiveHostChange: (host: HostId) => void;
  onHostNameChange: (host: HostId, name: string) => void;
  onHostSettingsChange: (host: HostId, settings: HostVoiceSettings) => void;
  onJiroBanterChange: (value: number) => void;
  onSharpayEnergyChange: (value: number) => void;
  onVoiceSearchChange: (value: string) => void;
  onPreviewVoice: (voice: TtsVoiceName) => void;
};

const STYLE_OPTIONS = ["Natural", "Vocal Smile", "Dry Wit", "Dramatic", "Warm", "Authoritative"];
const PACE_OPTIONS = ["Measured", "Conversational", "Up-tempo", "Rapid Fire"];
const ACCENT_OPTIONS = ["American (General)", "Filipino English", "British", "Australian", "Neutral International"];
const REFERENCE_ENGINES = new Set<DeepCastTtsEngine>(["chatterbox-nano", "chatterbox-turbo", "f5-tts", "fish-s2", "dia2"]);
const ORPHEUS_VOICES: Array<{ value: OrpheusVoiceName; label: string; description: string }> = [
  { value: "daniel", label: "Daniel", description: "Expressive male" },
  { value: "austin", label: "Austin", description: "Expressive male" },
  { value: "troy", label: "Troy", description: "Expressive male" },
  { value: "hannah", label: "Hannah", description: "Expressive female" },
  { value: "diana", label: "Diana", description: "Expressive female" },
  { value: "autumn", label: "Autumn", description: "Expressive female" },
];

function engineBadge(engine: DeepCastTtsEngine) {
  switch (engine) {
    case "chatterbox-turbo": return "CHATTERBOX TURBO";
    case "f5-tts": return "F5-TTS";
    case "fish-s2": return "FISH S2";
    case "dia2": return "DIA2";
    case "groq-orpheus": return "GROQ ORPHEUS";
    case "gemini": return "GEMINI";
    default: return "CHATTERBOX NANO";
  }
}

export default function SpeakerSettings({
  activeHost,
  hostNames,
  hostSettings,
  jiroBanter,
  sharpayEnergy,
  onActiveHostChange,
  onHostNameChange,
  onHostSettingsChange,
  onJiroBanterChange,
  onSharpayEnergyChange,
}: SpeakerSettingsProps) {
  const [uploadingReference, setUploadingReference] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const settings = hostSettings[activeHost];
  const hostLabel = hostNames[activeHost] || (activeHost === "jiro" ? "Jiro" : "Sharpay");
  const referenceEngine = REFERENCE_ENGINES.has(settings.ttsEngine);
  const orpheusEngine = settings.ttsEngine === "groq-orpheus";

  function update(patch: Partial<HostVoiceSettings>) {
    onHostSettingsChange(activeHost, { ...settings, ...patch });
  }

  function changeEngine(engine: DeepCastTtsEngine) {
    if (engine === "groq-orpheus" && !settings.orpheusVoice) {
      update({ ttsEngine: engine, orpheusVoice: activeHost === "jiro" ? "daniel" : "hannah" });
      return;
    }
    update({ ttsEngine: engine });
  }

  async function uploadVoiceReference(file?: File) {
    if (!file) return;
    setUploadingReference(true);
    setReferenceError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const response = await fetch("/api/voice-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostName: hostLabel,
          fileName: file.name,
          mimeType: file.type || "audio/wav",
          audioBase64: btoa(binary),
        }),
      });
      const result = await response.json().catch(() => null) as { voiceReferenceKey?: string; fileName?: string; error?: string } | null;
      if (!response.ok || !result?.voiceReferenceKey) throw new Error(result?.error || "Voice reference upload failed.");
      update({ voiceReferenceKey: result.voiceReferenceKey, voiceReferenceName: result.fileName || file.name });
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : "Voice reference upload failed.");
    } finally {
      setUploadingReference(false);
    }
  }

  return (
    <section className="approved-studio-panel speaker-settings-panel">
      <div className="approved-panel-title"><span aria-hidden="true">♫</span><h2>SPEAKER SETTINGS</h2></div>

      <div className="speaker-tabs" role="tablist" aria-label="Choose host to configure">
        <button type="button" role="tab" aria-selected={activeHost === "jiro"} className={activeHost === "jiro" ? "active" : ""} onClick={() => onActiveHostChange("jiro")}>
          <span>HOST 1</span><strong>{hostNames.jiro || "Jiro"}</strong><small>{engineBadge(hostSettings.jiro.ttsEngine)}</small>
        </button>
        <button type="button" role="tab" aria-selected={activeHost === "sharpay"} className={activeHost === "sharpay" ? "active sharpay" : ""} onClick={() => onActiveHostChange("sharpay")}>
          <span>HOST 2</span><strong>{hostNames.sharpay || "Sharpay"}</strong><small>{engineBadge(hostSettings.sharpay.ttsEngine)}</small>
        </button>
      </div>

      <div className="speaker-setting-content" role="tabpanel" aria-label={`${hostLabel} speaker settings`}>
        <label className="approved-field-label" htmlFor={`${activeHost}-host-name`}>Host Name</label>
        <input
          id={`${activeHost}-host-name`}
          className="approved-studio-input host-name-input"
          value={hostNames[activeHost]}
          maxLength={40}
          onChange={(event) => onHostNameChange(activeHost, event.target.value)}
          placeholder={activeHost === "jiro" ? "Jiro" : "Sharpay"}
        />

        <label className="approved-field-label" htmlFor={`${activeHost}-audio-profile`}>Audio Profile</label>
        <textarea
          id={`${activeHost}-audio-profile`}
          className="approved-studio-textarea speaker-profile-input"
          value={settings.audioProfile}
          onChange={(event) => update({ audioProfile: event.target.value })}
          placeholder={`Describe ${hostLabel}'s core voice identity and archetype...`}
        />

        <label className="speaker-performance-control">
          <span>{activeHost === "jiro" ? "Banter Level" : "Energy Level"}</span>
          <strong>{activeHost === "jiro" ? jiroBanter : sharpayEnergy}%</strong>
          <input
            type="range"
            min="10"
            max="100"
            value={activeHost === "jiro" ? jiroBanter : sharpayEnergy}
            onChange={(event) => activeHost === "jiro" ? onJiroBanterChange(Number(event.target.value)) : onSharpayEnergyChange(Number(event.target.value))}
          />
        </label>

        <div className="director-note-heading">
          <strong>Director&apos;s Note</strong>
          <span>Applied to the generated performance</span>
        </div>
        <div className="director-note-grid">
          <label><span>Style</span><select value={settings.style} onChange={(event) => update({ style: event.target.value })}>{STYLE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label><span>Pace</span><select value={settings.pace} onChange={(event) => update({ pace: event.target.value })}>{PACE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label><span>Accent</span><select value={settings.accent} onChange={(event) => update({ accent: event.target.value })}>{ACCENT_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
        </div>

        <div className="tts-engine-panel">
          <div className="voice-library-heading"><div><strong>VOICE ENGINE</strong><span>Clone engines plus hosted expressive stock voices</span></div></div>
          <label className="approved-field-label" htmlFor={`${activeHost}-tts-engine`}>Engine</label>
          <select id={`${activeHost}-tts-engine`} className="approved-studio-input" value={settings.ttsEngine} onChange={(event) => changeEngine(event.target.value as DeepCastTtsEngine)}>
            <option value="chatterbox-nano">Chatterbox Nano · default CPU clone</option>
            <option value="chatterbox-turbo">Chatterbox Turbo · quality clone</option>
            <option value="f5-tts">F5-TTS · alternate reference clone</option>
            <option value="fish-s2" disabled>Fish Audio S2-Pro · add Fish API credential first</option>
            <option value="dia2" disabled>Dia2 · deploy private GPU service first</option>
            <option value="groq-orpheus">Groq Orpheus · hosted expressive stock voice</option>
          </select>

          {orpheusEngine ? (
            <div className="voice-reference-box">
              <strong>ORPHEUS STOCK VOICE</strong>
              <p>Hosted expressive speech through Groq. The current Groq organization must accept the Orpheus model terms before first use.</p>
              <select
                className="approved-studio-input"
                value={settings.orpheusVoice || (activeHost === "jiro" ? "daniel" : "hannah")}
                onChange={(event) => update({ orpheusVoice: event.target.value as OrpheusVoiceName })}
              >
                {ORPHEUS_VOICES.map((voice) => <option key={voice.value} value={voice.value}>{voice.label} · {voice.description}</option>)}
              </select>
            </div>
          ) : referenceEngine ? (
            <div className="voice-reference-box">
              <strong>VOICE REFERENCE</strong>
              <p>Upload a clean 5–20 second clip with one speaker, no music, and minimal room echo. The private reference is stored in DeepCast R2.</p>
              <label className="voice-reference-upload">＋ {uploadingReference ? "UPLOADING REFERENCE…" : "UPLOAD VOICE REFERENCE"}<input type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a" disabled={uploadingReference} onChange={(event) => void uploadVoiceReference(event.target.files?.[0])} /></label>
              <small className={referenceError ? "voice-reference-error" : ""}>{referenceError || (settings.voiceReferenceName ? `Saved: ${settings.voiceReferenceName}` : "Reference required before generation.")}</small>
              {(settings.ttsEngine === "f5-tts" || settings.ttsEngine === "fish-s2") && (
                <label className="approved-field-label">
                  Reference Transcript <span>(optional)</span>
                  <textarea className="approved-studio-textarea" value={settings.voiceReferenceText || ""} onChange={(event) => update({ voiceReferenceText: event.target.value })} placeholder="Optional transcript of the reference clip; Fish can use ASR when omitted." />
                </label>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
