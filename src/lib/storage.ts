import type { EpisodeRecord, ProjectRecord } from '../types';

const PROJECTS_KEY = 'deepcast.projects.v1';
const EPISODES_KEY = 'deepcast.episodes.v1';

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }

export const getProjects = () => read<ProjectRecord[]>(PROJECTS_KEY, []);
export const saveProjects = (value: ProjectRecord[]) => write(PROJECTS_KEY, value);
export const getEpisodes = () => read<EpisodeRecord[]>(EPISODES_KEY, []);
export const saveEpisodes = (value: EpisodeRecord[]) => write(EPISODES_KEY, value);

export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
