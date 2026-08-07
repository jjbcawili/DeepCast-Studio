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

export type EpisodeRecord = {
  id: string;
  title: string;
  prompt: string;
  projectId?: string;
  format: string;
  runtime: string;
  script?: string;
  createdAt: string;
  engine?: string;
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
