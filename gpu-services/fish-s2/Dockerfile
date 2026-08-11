FROM nvidia/cuda:12.9.0-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/home/user/.cache/huggingface \
    FISH_LOCAL_URL=http://127.0.0.1:8080 \
    FISH_LOCAL_API_KEY=deepcast-local-fish

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-dev git curl ca-certificates ffmpeg \
      libsox-dev build-essential cmake libasound-dev portaudio19-dev \
      libportaudio2 libportaudiocpp0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user

COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /uvx /usr/local/bin/

USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user

RUN git clone --depth 1 --branch v2.0.0-beta https://github.com/fishaudio/fish-speech.git /home/user/fish-speech
WORKDIR /home/user/fish-speech
RUN uv python pin 3.12 \
    && uv sync --extra cu129 --frozen \
    && uv pip install fastapi 'uvicorn[standard]' python-multipart requests 'huggingface-hub>=1.0,<2.0'

WORKDIR /home/user/bridge
COPY --chown=user app.py ./app.py
COPY --chown=user start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 7860
CMD ["./start.sh"]
