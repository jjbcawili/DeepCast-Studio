export type SourceRecord = {
  id: string;
  title: string;
  type: 'text' | 'url' | 'file' | 'drive';
  content?: string;
  url?: string;
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  title: string;
  description: string;
  coverDataUrl?: string;
  sources: SourceRecord[];
  createdAt: string;
  updatedAt: string;
};

export type EpisodeStatus =
  | 'SUBMITTING'
  | 'QUEUED'
  | 'SCRIPTING'
  | 'SCRIPT_READY'
  | 'AUDIO_QUEUED'
  | 'SYNTHESIZING'
  | 'MIXING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export type EpisodeEvent = {
  at: string;
  status: EpisodeStatus;
  message: string;
};

export type EpisodeAsset = {
  kind: 'mp3' | 'm4a' | 'wav' | 'transcript' | 'cover';
  url: string;
  label?: string;
};

export type EpisodeRecord = {
  id: string;
  remoteId?: string;
  title: string;
  prompt: string;
  projectId?: string;
  format: string;
  runtime: string;
  script?: string;
  createdAt: string;
  updatedAt: string;
  engine?: string;
  status: EpisodeStatus;
  progress: number;
  progressMessage: string;
  error?: string;
  retryable?: boolean;
  assets?: EpisodeAsset[];
  events?: EpisodeEvent[];
};

export type HostConfig = {
  name: string;
  voice: string;
  profile: string;
  style: string;
  pace: string;
  accent: string;
  banter: number;
  directorsNote: string;
};

export type EpisodeSubmitPayload = {
  localEpisodeId: string;
  episodeTitle: string;
  prompt: string;
  projectId?: string;
  format: string;
  runtime: string;
  scriptGuidance: string;
  guidanceMode: 'guided' | 'follow';
  allowVerifiedAdditions: boolean;
  sourceMaterial: string;
  webSearch: boolean;
  producerInstructions: string;
  host1: HostConfig;
  host2: HostConfig;
  downloadFormat: string;
  audioOutput: string;
  musicMode: string;
  coverMode: string;
};
