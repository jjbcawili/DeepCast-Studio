"use client";

import { useMemo } from "react";
import { TTS_VOICES, type TtsVoiceName } from "../../lib/tts-voices";

export type HostId = "jiro" | "sharpay";

export type HostVoiceSettings = {
  voice: TtsVoiceName;
  audioProfile: string;
  style: string;
  pace: string;
  accent: string;
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

export default function SpeakerSettings({
  activeHost,
  hostNames,
  hostSettings,
  jiroBanter,
  sharpayEnergy,
  voiceSearch,
  previewingVoice,
  previewAudioUrl,
  previewLabel,
  onActiveHostChange,
  onHostNameChange,
  onHostSettingsChange,
  onJiroBanterChange,
  onSharpayEnergyChange,
  onVoiceSearchChange,
  onPreviewVoice,
}: SpeakerSettingsProps) {
  const settings = hostSettings[activeHost];
  const hostLabel = hostNames[activeHost] || (activeHost === "jiro" ? "Jiro" : "Sharpay");
  const filteredVoices = useMemo(() => {
    const query = voiceSearch.trim().toLowerCase();
    if (!query) return TTS_VOICES;
    return TTS_VOICES.filter((voice) => `${voice.name} ${voice.character} ${voice.pitch} ${voice.provider}`.toLowerCase().includes(query));
  }, [voiceSearch]);

  function update(patch: Partial<HostVoiceSettings>) {
    onHostSettingsChange(activeHost, { ...settings, ...patch });
  }

  return (
    <section className="approved-studio-panel speaker-settings-panel">
      <div className="approved-panel-title"><span aria-hidden="true">♫</span><h2>SPEAKER SETTINGS</h2></div>

      <div className="speaker-tabs" role="tablist" aria-label="Choose host to configure">
        <button type="button" role="tab" aria-selected={activeHost === "jiro"} className={activeHost === "jiro" ? "active" : ""} onClick={() => onActiveHostChange("jiro")}>
          <span>HOST 1</span><strong>{hostNames.jiro || "Jiro"}</strong><small>{hostSettings.jiro.voice}</small>
        </button>
        <button type="button" role="tab" aria-selected={activeHost === "sharpay"} className={activeHost === "sharpay" ? "active sharpay" : ""} onClick={() => onActiveHostChange("sharpay")}>
          <span>HOST 2</span><strong>{hostNames.sharpay || "Sharpay"}</strong><small>{hostSettings.sharpay.voice}</small>
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

        <div className="voice-library-heading">
          <div><strong>Voice</strong><span>{filteredVoices.length} supported voices</span></div>
          <span className="selected-voice-badge">Selected: {settings.voice}</span>
        </div>
        <label className="voice-search">
          <span aria-hidden="true">⌕</span>
          <input value={voiceSearch} onChange={(event) => onVoiceSearchChange(event.target.value)} placeholder="Search voices" aria-label="Search voices" />
        </label>

        <div className="voice-scroll" role="listbox" aria-label={`Select ${hostLabel}'s voice`} aria-activedescendant={`${activeHost}-voice-${settings.voice}`}>
          {filteredVoices.map((voice) => {
            const selected = settings.voice === voice.name;
            const previewing = previewingVoice === `${activeHost}:${voice.name}`;
            return (
              <div className={`voice-option ${selected ? "selected" : ""}`} key={voice.name}>
                <button
                  id={`${activeHost}-voice-${voice.name}`}
                  type="button"
                  className="voice-select-button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => update({ voice: voice.name })}
                >
                  <span className="voice-option-name">{voice.name}{"defaultFor" in voice && voice.defaultFor === activeHost ? <b className="voice-default-badge">DEFAULT</b> : null}</span>
                  <span className="voice-option-tags"><i>{voice.provider}</i><i>{voice.character}</i><i>{voice.pitch}</i></span>
                </button>
                <button type="button" className="voice-preview-button" onClick={() => onPreviewVoice(voice.name)} disabled={previewingVoice !== null} aria-label={`Preview ${voice.name} voice`} title={`Preview ${voice.name}`}>
                  {previewing ? "PREPARING…" : "▶ PREVIEW"}
                </button>
              </div>
            );
          })}
          {filteredVoices.length === 0 && <p className="voice-empty">No voices match “{voiceSearch}”.</p>}
        </div>
        {previewAudioUrl && (
          <div className="voice-preview-player">
            <span>VOICE PREVIEW · {previewLabel}</span>
            <audio key={previewAudioUrl} controls autoPlay src={previewAudioUrl} />
          </div>
        )}
      </div>
    </section>
  );
}
