UPDATE episodes
SET status = 'COMPLETE',
    progress = 100,
    progress_message = 'Episode generation complete. Audio is ready to play and download.',
    error = NULL,
    failed_stage = NULL,
    retryable = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'FAILED'
  AND id IN (SELECT DISTINCT episode_id FROM episode_assets);
