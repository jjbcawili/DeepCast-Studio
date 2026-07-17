import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

type HostKey = 'Host1' | 'Host2';
type PreviewHost = 'jiro' | 'sharpay';
type DialogueTurn = {
  speaker: HostKey;
  text: string;
  voice_id: string;
};

type SingleVoiceOptions = {
  seed?: number;
  previousText?: string;
  nextText?: string;
};

const JIRO_VOICE_ID = process.env.JIRO_ELEVENLABS_VOICE_ID || 'pe3VMth5BPRL0ZY3J9lc';
const SHARPAY_VOICE_ID = process.env.SHARPAY_ELEVENLABS_VOICE_ID || 'uC66YjdAMHXrcaX6MoXS';
const DEFAULT_TTS_MODEL = 'eleven_v3';
const FALLBACK_TTS_MODEL = 'eleven_multilingual_v2';
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_DIALOGUE_CHARS = 1900;
const NATURAL_STABILITY = 0.5;
const UINT32_MAX = 4_294_967_295;

function voiceIdForSpeaker(speaker: HostKey): string {
  return speaker === 'Host1' ? JIRO_VOICE_ID : SHARPAY_VOICE_ID;
}

function normalizeSeed(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > UINT32_MAX) return undefined;
  return parsed >>> 0;
}

function hashToSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deriveGenerationSeed(payload: Record<string, unknown>): number {
  const requested = normalizeSeed(payload.seed);
  if (requested !== undefined) return requested;

  return hashToSeed(JSON.stringify({
    sourceMaterial: payload.sourceMaterial || '',
    topic: payload.topic || '',
    length: payload.length || '',
    customPrompt: payload.customPrompt || '',
    host1Profile: payload.host1Profile || '',
    host2Profile: payload.host2Profile || '',
  }));
}

function seedForBatch(baseSeed: number, segmentIndex: number, batchIndex: number): number {
  return (baseSeed + segmentIndex * 1000 + batchIndex) >>> 0;
}

function stripAudioTags(text: string): string {
  return text.replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

function parseDialogue(script: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let current: DialogueTurn | null = null;

  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^Host([12]):\s*(.*)$/i);
    if (match) {
      if (current?.text.trim()) turns.push(current);
      const speaker: HostKey = match[1] === '1' ? 'Host1' : 'Host2';
      current = {
        speaker,
        text: match[2].trim(),
        voice_id: voiceIdForSpeaker(speaker),
      };
      continue;
    }

    if (current) current.text = `${current.text} ${line}`.trim();
  }

  if (current?.text.trim()) turns.push(current);
  return turns;
}

function splitText(text: string, maxChars = 850): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChars) {
      flush();
      const words = trimmed.split(/\s+/);
      let wordChunk = '';

      for (const word of words) {
        const candidate = wordChunk ? `${wordChunk} ${word}` : word;
        if (candidate.length > maxChars) {
          if (wordChunk) chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = candidate;
        }
      }

      if (wordChunk) chunks.push(wordChunk);
      continue;
    }

    const candidate = current ? `${current} ${trimmed}` : trimmed;
    if (candidate.length > maxChars) {
      flush();
      current = trimmed;
    } else {
      current = candidate;
    }
  }

  flush();
  return chunks;
}

function batchDialogue(turns: DialogueTurn[]): DialogueTurn[][] {
  const normalized = turns.flatMap(turn =>
    splitText(turn.text).map(text => ({ ...turn, text })),
  );

  const batches: DialogueTurn[][] = [];
  let current: DialogueTurn[] = [];
  let charCount = 0;

  for (const turn of normalized) {
    const nextCount = charCount + turn.text.length;
    if (current.length > 0 && nextCount > MAX_DIALOGUE_CHARS) {
      batches.push(current);
      current = [];
      charCount = 0;
    }

    current.push(turn);
    charCount += turn.text.length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function readElevenError(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return 'No error body returned.';
  }
}

async function generateDialogueAudio(
  apiKey: string,
  inputs: DialogueTurn[],
  seed: number,
): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-dialogue?output_format=${ELEVEN_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: inputs.map(({ text, voice_id }) => ({ text, voice_id })),
        model_id: DEFAULT_TTS_MODEL,
        settings: { stability: NATURAL_STABILITY },
        seed,
        apply_text_normalization: 'auto',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs dialogue failed (${response.status}): ${await readElevenError(response)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateSingleVoiceAudio(
  apiKey: string,
  text: string,
  voiceId: string,
  modelId: string,
  options: SingleVoiceOptions = {},
): Promise<Buffer> {
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    apply_text_normalization: 'auto',
  };

  if (options.seed !== undefined) body.seed = options.seed;
  if (options.previousText) body.previous_text = options.previousText;
  if (options.nextText) body.next_text = options.nextText;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVEN_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs speech failed (${response.status}): ${await readElevenError(response)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

function previewTextForHost(host: PreviewHost): string {
  return host === 'jiro'
    ? '[warmly] Welcome to DeepCast Studio. I’m Jiro, and I’ll keep the timeline, evidence, and larger story clear while we work through every important detail. [lightly amused] Sharpay may bring the fireworks, but somebody has to keep the receipts organized. Together, we’re turning source material into a focused, natural, genuinely useful deep dive.'
    : '[brightly] Welcome to DeepCast Studio. I’m Sharpay, and yes, the details matter, but so do drama, timing, texture, and knowing exactly when a fact deserves a spotlight. [mischievously] Jiro can hold the clipboard. I’ll make sure the episode has a pulse. Together, we’re giving your sources the full main-character treatment without sacrificing accuracy.';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '50mb' }));

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  app.post('/api/preview-voice', async (req, res) => {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'ELEVENLABS_API_KEY environment variable is required',
        });
      }

      const host: PreviewHost = req.body?.host === 'sharpay' ? 'sharpay' : 'jiro';
      const model = req.body?.model === FALLBACK_TTS_MODEL
        ? FALLBACK_TTS_MODEL
        : DEFAULT_TTS_MODEL;
      const voiceId = host === 'jiro' ? JIRO_VOICE_ID : SHARPAY_VOICE_ID;
      const text = typeof req.body?.text === 'string' && req.body.text.trim()
        ? req.body.text.trim().slice(0, 5000)
        : previewTextForHost(host);
      const seed = normalizeSeed(req.body?.seed) ?? hashToSeed(`${host}:${model}:${text}`);

      const audio = await generateSingleVoiceAudio(
        apiKey,
        model === FALLBACK_TTS_MODEL ? stripAudioTags(text) : text,
        voiceId,
        model,
        { seed },
      );

      return res.json({
        audio: audio.toString('base64'),
        mimeType: 'audio/mpeg',
        model,
        host,
        seed,
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message || 'Voice preview failed' });
    }
  });

  app.post('/api/generate-podcast', async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const payload = (req.body || {}) as Record<string, unknown>;
      const sourceMaterial = String(payload.sourceMaterial || '');
      const topic = String(payload.topic || '');
      const length = String(payload.length || '15');
      const customPrompt = String(payload.customPrompt || '');
      const host1Profile = String(payload.host1Profile || '');
      const host2Profile = String(payload.host2Profile || '');
      const generationSeed = deriveGenerationSeed(payload);

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

      if (!geminiApiKey) throw new Error('GEMINI_API_KEY environment variable is required');
      if (!elevenLabsApiKey) throw new Error('ELEVENLABS_API_KEY environment variable is required');

      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      let numSegments = 2;
      if (length === '15') numSegments = 5;
      if (length === '30') numSegments = 10;
      if (length === '45') numSegments = 15;
      if (length === '60') numSegments = 20;

      sendEvent('generation_config', {
        model: DEFAULT_TTS_MODEL,
        fallbackModel: FALLBACK_TTS_MODEL,
        stability: NATURAL_STABILITY,
        seed: generationSeed,
        voiceIds: { jiro: JIRO_VOICE_ID, sharpay: SHARPAY_VOICE_ID },
      });
      sendEvent('progress', { message: 'Generating podcast outline...' });

      const outlinePrompt = `You are a podcast producer outlining an audio overview.
Source material: ${sourceMaterial || 'General knowledge'}
Focus/Topic: ${topic || 'Pop culture and entertainment'}
Target length: ~${length} minutes.

Create an outline divided into exactly ${numSegments} continuous segments.
Return ONLY a valid JSON array of strings, where each string describes what will be discussed in that segment. Do not include markdown formatting or backticks around the JSON.`;

      const outlineResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: outlinePrompt,
      });

      let outlineText = outlineResponse.text || '[]';
      outlineText = outlineText.replace(/```json/g, '').replace(/```/g, '').trim();
      let segments: string[] = [];

      try {
        const parsed = JSON.parse(outlineText);
        if (Array.isArray(parsed)) segments = parsed.map(item => String(item));
      } catch {
        console.error('Failed to parse outline JSON:', outlineText);
      }

      if (segments.length === 0) {
        segments = Array.from(
          { length: numSegments },
          (_, index) => `Segment ${index + 1}: Deep dive into the topic.`,
        );
      }

      sendEvent('outline', { segments });
      sendEvent('progress', {
        message: 'Eleven v3 dialogue enabled for Jiro and Sharpay.',
      });

      let previousContext = '';

      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        sendEvent('progress', {
          message: `Writing script for segment ${segmentIndex + 1} of ${segments.length}...`,
        });

        const defaultHost1 = 'Jiro: warm, witty, organized male host who keeps the timeline, release details, and source evidence clear.';
        const defaultHost2 = 'Sharpay: theatrical, slightly nasal, diva-like female host with playful “main character” energy; funny, expressive, a little savage, but respectful and accurate.';
        const host1Persona = host1Profile || defaultHost1;
        const host2Persona = host2Profile || defaultHost2;

        const scriptPrompt = `You are an expert podcast scriptwriter writing Segment ${segmentIndex + 1} of ${segments.length}.
Segment Topic: ${segments[segmentIndex]}
Overall Focus: ${topic || 'Pop culture and entertainment'}
${customPrompt ? `Specific Instructions/Focus: ${customPrompt}` : ''}

The podcast features two distinct hosts with a dynamic, highly engaging conversational style:
Host1 (Jiro): ${host1Persona}
Host2 (Sharpay): ${host2Persona}

Their dynamic: Playful tension. Jiro grounds the conversation with timeline and facts, while Sharpay elevates it with passionate, theatrical energy. They banter naturally and sound like a polished, immersive deep-dive podcast.

${previousContext ? `Previous context for continuity:\n${previousContext}\n\nContinue the conversation naturally from here.` : 'This is the start of the podcast. Introduce the topic and hook the listener.'}

FORMAT EXACTLY AS FOLLOWS:
Host1: [Jiro's dialogue]
Host2: [Sharpay's dialogue]

Use sparse Eleven v3 delivery tags inside the spoken dialogue when useful, such as [warmly], [dryly], [mischievously], [laughs softly], or [whispers]. Do not use a tag on every line. Do not include sound-effect-only directions or narration outside Host1 and Host2 lines. Aim for around 260-320 words for this segment.`;

        const scriptResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: scriptPrompt,
        });

        const scriptText = scriptResponse.text || '';
        previousContext = scriptText.substring(Math.max(0, scriptText.length - 300));

        const dialogueTurns = parseDialogue(scriptText);
        if (dialogueTurns.length === 0) {
          throw new Error(`No valid Host1/Host2 dialogue was produced for segment ${segmentIndex + 1}`);
        }

        const dialogueBatches = batchDialogue(dialogueTurns);
        sendEvent('progress', {
          message: `Generating Eleven v3 audio for segment ${segmentIndex + 1} of ${segments.length}...`,
        });

        const renderedParts: Buffer[] = [];
        let usedFallback = false;

        for (let batchIndex = 0; batchIndex < dialogueBatches.length; batchIndex += 1) {
          const batch = dialogueBatches[batchIndex];
          const batchSeed = seedForBatch(generationSeed, segmentIndex, batchIndex);

          try {
            renderedParts.push(
              await generateDialogueAudio(elevenLabsApiKey, batch, batchSeed),
            );
          } catch (dialogueError) {
            usedFallback = true;
            console.warn('Eleven v3 dialogue failed; using Multilingual v2 fallback.', dialogueError);
            sendEvent('progress', {
              message: `Eleven v3 needed a stable fallback for segment ${segmentIndex + 1}; rendering with Multilingual v2...`,
            });

            for (let turnIndex = 0; turnIndex < batch.length; turnIndex += 1) {
              const turn = batch[turnIndex];
              renderedParts.push(
                await generateSingleVoiceAudio(
                  elevenLabsApiKey,
                  stripAudioTags(turn.text),
                  turn.voice_id,
                  FALLBACK_TTS_MODEL,
                  {
                    seed: (batchSeed + turnIndex) >>> 0,
                    previousText: batch[turnIndex - 1]
                      ? stripAudioTags(batch[turnIndex - 1].text)
                      : undefined,
                    nextText: batch[turnIndex + 1]
                      ? stripAudioTags(batch[turnIndex + 1].text)
                      : undefined,
                  },
                ),
              );
            }
          }
        }

        if (renderedParts.length > 0) {
          const combinedAudio = Buffer.concat(renderedParts).toString('base64');
          sendEvent('audio_chunk', {
            index: segmentIndex,
            audio: combinedAudio,
            transcript: scriptText,
            engine: usedFallback ? FALLBACK_TTS_MODEL : DEFAULT_TTS_MODEL,
            seed: generationSeed,
          });
        }

        await delay(500);
      }

      sendEvent('done', {
        message: 'Podcast generation complete with ElevenLabs voices.',
        model: DEFAULT_TTS_MODEL,
        seed: generationSeed,
      });
    } catch (error: any) {
      console.error(error);
      sendEvent('error', { message: error.message || 'An error occurred during generation' });
    } finally {
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
