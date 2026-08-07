export type EpisodeStatus =
  | 'submitted'
  | 'queued'
  | 'scripting'
  | 'rendering_audio'
  | 'mixing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export type Episode = {
  id: string;
  project_id?: string | null;
  title: string;
  prompt: string;
  status: EpisodeStatus;
  stage: string;
  progress: number;
  runtime_minutes?: number | null;
  format?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  exports_json?: string | null;
  created_at: string;
  updated_at: string;
};

export type EpisodeSegment = {
  id: string;
  idx: number;
  speaker: 'Jiro' | 'Sharpay';
  text: string;
  status: string;
  attempts: number;
  audio_r2_key?: string | null;
  failure_message?: string | null;
};

export type EpisodePayload = {
  title?: string;
  prompt: string;
  topic?: string;
  sourceMaterial?: string;
  runtimeMinutes?: number;
  format?: string;
  projectId?: string | null;
  producerInstructions?: string;
  host1Profile?: string;
  host2Profile?: string;
  sources?: unknown[];
};

export const BACKGROUND_API_BASE =
  (import.meta.env.VITE_BACKGROUND_API_BASE || '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKGROUND_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `DeepCast background API failed (${response.status})`);
  }
  return payload as T;
}

export async function createEpisode(payload: EpisodePayload) {
  return request<{ episodeId: string; status: EpisodeStatus; href: string }>('/api/episodes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getEpisode(episodeId: string) {
  return request<{ episode: Episode; segments: EpisodeSegment[] }>(`/api/episodes/${episodeId}`);
}

export async function cancelEpisode(episodeId: string) {
  return request(`/api/episodes/${episodeId}/cancel`, { method: 'POST' });
}

export async function retryEpisode(episodeId: string) {
  return request(`/api/episodes/${episodeId}/retry`, { method: 'POST' });
}

export async function retrySegment(episodeId: string, segmentId: string) {
  return request(`/api/episodes/${episodeId}/segments/${segmentId}/retry`, { method: 'POST' });
}

export function exportUrl(episodeId: string, format: 'mp3' | 'wav' | 'm4a') {
  return `${BACKGROUND_API_BASE}/api/episodes/${episodeId}/export/${format}`;
}
