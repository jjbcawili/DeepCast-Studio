import type { EpisodeRecord, EpisodeSubmitPayload } from '../types';

let tokenProvider: (() => Promise<string | null>) | null = null;

export function registerTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenProvider ? await tokenProvider() : null;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(body?.error || body?.message || `Request failed (${response.status})`) as Error & { status?: number; body?: any };
    error.status = response.status; error.body = body; throw error;
  }
  return body as T;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export const api = {
  config: () => request<{ backendConfigured: boolean; chatgptSignInSupported: boolean; chatgptSignInUrl?: string | null; generationArchitecture: string }>('/api/config'),
  submitEpisode: (payload: EpisodeSubmitPayload) => request<{ episode: EpisodeRecord }>('/api/episodes', { method: 'POST', body: JSON.stringify(payload) }),
  getEpisode: (id: string) => request<{ episode: EpisodeRecord }>(`/api/episodes/${encodeURIComponent(id)}`),
  retryEpisode: (id: string) => request<{ episode: EpisodeRecord }>(`/api/episodes/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  cancelEpisode: (id: string) => request<{ episode: EpisodeRecord }>(`/api/episodes/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  generateAudio: (id: string) => request<{ episode: EpisodeRecord }>(`/api/episodes/${encodeURIComponent(id)}/audio`, { method: 'POST' }),
  uploadVoiceReference: async (hostName: string, file: File) => request<{ voiceReferenceKey:string; fileName:string; mimeType:string; size:number }>('/api/voice-references', { method: 'POST', body: JSON.stringify({ hostName, fileName:file.name, mimeType:file.type || 'audio/wav', audioBase64:await fileToBase64(file) }) }),
  previewVoice: (payload: any) => request<any>('/api/preview-voice', { method: 'POST', body: JSON.stringify(payload) }),
  chat: (payload: any) => request<{ text: string }>('/api/chat', { method: 'POST', body: JSON.stringify(payload) }),
};
