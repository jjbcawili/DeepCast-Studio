import type { EpisodeRecord, ProjectRecord } from '../types';

const PROJECTS_KEY = 'deepcast.projects.v1';
const EPISODES_KEY = 'deepcast.episodes.v2';
const LEGACY_EPISODES_KEY = 'deepcast.episodes.v1';

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }

export const getProjects = () => read<ProjectRecord[]>(PROJECTS_KEY, []);
export const saveProjects = (value: ProjectRecord[]) => write(PROJECTS_KEY, value);

function normalizeEpisode(raw: Partial<EpisodeRecord> & { id: string; title: string; prompt: string; format: string; runtime: string; createdAt: string }): EpisodeRecord {
  const status = raw.status || (raw.engine ? 'COMPLETE' : raw.script ? 'SCRIPT_READY' : 'FAILED');
  return {
    ...raw,
    id: raw.id,
    title: raw.title,
    prompt: raw.prompt,
    format: raw.format,
    runtime: raw.runtime,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt,
    status,
    progress: raw.progress ?? (status === 'COMPLETE' ? 100 : status === 'SCRIPT_READY' ? 55 : 0),
    progressMessage: raw.progressMessage || (status === 'COMPLETE' ? 'Episode complete.' : status === 'SCRIPT_READY' ? 'Script ready.' : 'Imported from an older DeepCast record.'),
    assets: raw.assets || [],
    events: raw.events || [],
  };
}

export function getEpisodes(): EpisodeRecord[] {
  const current = read<EpisodeRecord[]>(EPISODES_KEY, []);
  if (current.length) return current.map(normalizeEpisode);
  const legacy = read<any[]>(LEGACY_EPISODES_KEY, []);
  if (!legacy.length) return [];
  const migrated = legacy.map(normalizeEpisode);
  write(EPISODES_KEY, migrated);
  return migrated;
}

export const saveEpisodes = (value: EpisodeRecord[]) => write(EPISODES_KEY, value);

export function upsertEpisode(record: EpisodeRecord) {
  const episodes = getEpisodes();
  const ix = episodes.findIndex(e => e.id === record.id || (!!record.remoteId && e.remoteId === record.remoteId));
  const next = ix >= 0 ? episodes.map((e, i) => i === ix ? record : e) : [record, ...episodes];
  saveEpisodes(next);
  return record;
}

export function patchEpisode(id: string, patch: Partial<EpisodeRecord>) {
  const episodes = getEpisodes();
  const current = episodes.find(e => e.id === id || e.remoteId === id);
  if (!current) return null;
  const nextRecord: EpisodeRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
  saveEpisodes(episodes.map(e => e.id === current.id ? nextRecord : e));
  return nextRecord;
}

export function getEpisode(id: string) {
  return getEpisodes().find(e => e.id === id || e.remoteId === id) || null;
}

export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
