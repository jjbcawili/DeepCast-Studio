PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_episode_id TEXT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  project_id TEXT,
  format TEXT NOT NULL,
  runtime TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT NOT NULL,
  script TEXT,
  research TEXT,
  engine TEXT,
  error TEXT,
  failed_stage TEXT,
  retryable INTEGER NOT NULL DEFAULT 1,
  expected_segments INTEGER NOT NULL DEFAULT 0,
  audio_queued INTEGER NOT NULL DEFAULT 0,
  mix_queued INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_user_created ON episodes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS episode_segments (
  episode_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  focus TEXT NOT NULL,
  script TEXT,
  audio_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (episode_id, segment_index),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_episode ON episode_events(episode_id, id DESC);

CREATE TABLE IF NOT EXISTS episode_assets (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  label TEXT,
  access_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
