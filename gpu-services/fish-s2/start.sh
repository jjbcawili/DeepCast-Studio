#!/usr/bin/env bash
set -euo pipefail

FISH_ROOT=/home/user/fish-speech
CHECKPOINT="$FISH_ROOT/checkpoints/s2-pro/codec.pth"

cd "$FISH_ROOT"
if [ ! -f "$CHECKPOINT" ]; then
  echo '[DeepCast Fish] Downloading official fishaudio/s2-pro checkpoints...'
  uv run python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='fishaudio/s2-pro',
    local_dir='checkpoints/s2-pro',
)
PY
fi

echo '[DeepCast Fish] Starting official Fish S2-Pro API server on localhost:8080...'
uv run tools/api_server.py \
  --listen 127.0.0.1:8080 \
  --llama-checkpoint-path checkpoints/s2-pro \
  --decoder-checkpoint-path checkpoints/s2-pro/codec.pth \
  --decoder-config-name modded_dac_vq \
  --api-key "${FISH_LOCAL_API_KEY:-deepcast-local-fish}" \
  --compile &
FISH_PID=$!

cleanup() {
  kill "$FISH_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd /home/user/bridge
exec /home/user/fish-speech/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 7860 --workers 1
