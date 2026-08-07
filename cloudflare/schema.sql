PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  topic TEXT,
  source_material TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  runtime_minutes INTEGER,
  format TEXT,
  config_json TEXT NOT NULL,
  outline_json TEXT,
  exports_json TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS episode_script_sections (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  outline_text TEXT NOT NULL,
  script_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, section_index),
  FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_segments (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  audio_r2_key TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, idx),
  FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episode_status ON episodes(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_section_episode ON episode_script_sections(episode_id, section_index);
CREATE INDEX IF NOT EXISTS idx_segment_episode ON episode_segments(episode_id, idx);
