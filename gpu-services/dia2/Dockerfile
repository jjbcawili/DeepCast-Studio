FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/home/user/.cache/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv git ffmpeg libsndfile1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user

USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user requirements.txt ./requirements.txt
RUN python3 -m pip install --user --break-system-packages --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0 \
    && python3 -m pip install --user --break-system-packages --no-cache-dir -r requirements.txt \
    && python3 -m pip install --user --break-system-packages --no-cache-dir \
      'git+https://github.com/nari-labs/dia2.git'

COPY --chown=user app.py ./app.py

EXPOSE 7860
CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
