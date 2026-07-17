import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

type HostKey = 'Host1' | 'Host2';
type DialogueTurn = {
  speaker: HostKey;
  text: string;
  voice_id: string;
};

const JIRO_VOICE_ID = process.env.JIRO_ELEVENLABS_VOICE_ID || 'pe3VMth5BPRL0ZY3J9lc';
const SHARPAY_VOICE_ID = process.env.SHARPAY_ELEVENLABS_VOICE_ID || 'uC66YjdAMHXrcaX6MoXS';
const DEFAULT_TTS_MODEL = 'eleven_v3';
const FALLBACK_TTS_MODEL = 'eleven_multilingual_v2';
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_DIALOGUE_CHARS = 1900;

function voiceIdForSpeaker(speaker: HostKey): string {
  return speaker === 'Host1' ? JIRO_VOICE_ID : SHARPAY_VOICE_ID;
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

    if (current) {
      current.text = `${current.text} ${line}`.trim();
    }
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
    const body = await response.text();
    return body.slice(0, 500);
  } catch {
    return 'No error body returned.';
  }
}

async function generateDialogueAudio(
  apiKey: string,
  inputs: DialogueTurn[],
): Promise<string> {
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
        apply_text_normalization: 'auto',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs dialogue failed (${response.status}): ${await readElevenError(response)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

async function generateSingleVoiceAudio(
  apiKey: string,
  text: string,
  voiceId: string,
  modelId = FALLBACK_TTS_MODEL,
): Promise<string> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVEN_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        apply_text_normalization: 'auto',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs speech failed (${response.status}): ${await readElevenError(response)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  app.post('/api/preview-voice', async (req, res) => {
    try {
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsApiKey) {
        return res.status(503).json({
          error: 'ELEVENLABS_API_KEY environment variable is required',
        });
      }

      const host: 'jiro' | 'sharpay' = req.body?.host === 'sharpay' ? 'sharpay' : 'jiro';
      const requestedModel = req.body?.model === FALLBACK_TTS_MODEL
        ? FALLBACK_TTS_MODEL
        : DEFAULT_TTS_MODEL;
      const voiceId = host === 'jiro' ? JIRO_VOICE_ID : SHARPAY_VOICE_ID;
      const previewText = host === 'jiro'
        ? '[warmly] Welcome to DeepCast Studio. I’m Jiro, and I’ll keep the timeline, evidence, and larger story clear while we work through every important detail. [lightly amused] Sharpay may bring the fireworks, but somebody has to keep the receipts organized. Together, we’re turning source material into a focused, natural, genuinely useful deep dive.'
        : '[brightly] Welcome to DeepCast Studio. I’m Sharpay, and yes, the details matter, but so do drama, timing, texture, and knowing exactly when a fact deserves a spotlight. [mischievously] Jiro can hold the clipboard. I’ll make sure the episode has a pulse. Together, we’re giving your sources the full main-character treatment without sacrificing accuracy.';

      const audio = await generateSingleVoiceAudio(
        elevenLabsApiKey,
        previewText,
        voiceId,
        requestedModel,
      );

      return res.json({
        audio,
        mimeType: 'audio/mpeg',
        model: requestedModel,
        host,
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
      const {
        sourceMaterial,
        topic,
        length,
        customPrompt,
        host1Profile,
        host2Profile,
      } = req.body;
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

      if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      if (!elevenLabsApiKey) {
        throw new Error('ELEVENLABS_API_KEY environment variable is required');
      }

      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      let numSegments = 2;
      if (length === '15') numSegments = 5;
      if (length === '30') numSegments = 10;
      if (length === '45') numSegments = 15;
      if (length === '60') numSegments = 20;

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
        segments = JSON.parse(outlineText);
      } catch {
        console.error('Failed to parse outline JSON:', outlineText);
        for (let i = 0; i < numSegments; i++) {
          segments.push(`Segment ${i + 1}: Deep dive into the topic.`);
        }
      }

      sendEvent('outline', { segments });
      sendEvent('progress', {
        message: 'Eleven v3 dialogue enabled for Jiro and Sharpay.',
      });

      let previousContext = '';

      for (let i = 0; i < segments.length; i++) {
        sendEvent('progress', {
          message: `Writing script for segment ${i + 1} of ${segments.length}...`,
        });

        const defaultHost1 = 'Jiro: warm, witty, organized male host who keeps the timeline, release details, and source evidence clear.';
        const defaultHost2 = 'Sharpay: theatrical, slightly nasal, diva-like female host with playful “main character” energy; funny, expressive, a little savage, but respectful and accurate.';
        const host1Persona = host1Profile || defaultHost1;
        const host2Persona = host2Profile || defaultHost2;

        const scriptPrompt = `You are an expert podcast scriptwriter writing Segment ${i + 1} of ${segments.length}.
Segment Topic: ${segments[i]}
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
          throw new Error(`No valid Host1/Host2 dialogue was produced for segment ${i + 1}`);
        }

        const dialogueBatches = batchDialogue(dialogueTurns);
        sendEvent('progress', {
          message: `Generating Eleven v3 audio for segment ${i + 1} of ${segments.length}...`,
        });

        const renderedParts: Buffer[] = [];
        let usedFallback = false;

        for (const batch of dialogueBatches) {
          try {
            const audioBase64 = await generateDialogueAudio(elevenLabsApiKey, batch);
            renderedParts.push(Buffer.from(audioBase64, 'base64'));
          } catch (dialogueError) {
            usedFallback = true;
            console.warn('Eleven v3 dialogue failed; using multilingual v2 fallback.', dialogueError);
            sendEvent('progress', {
              message: `Eleven v3 needed a stable fallback for segment ${i + 1}; rendering with Multilingual v2...`,
            });

            for (const turn of batch) {
              const audioBase64 = await generateSingleVoiceAudio(
                elevenLabsApiKey,
                turn.text,
                turn.voice_id,
                FALLBACK_TTS_MODEL,
              );
              renderedParts.push(Buffer.from(audioBase64, 'base64'));
            }
          }
        }

        if (renderedParts.length > 0) {
          // ElevenLabs returns MP3 frame streams. Concatenating the frames keeps the
          // segment as one browser-decodable audio chunk and preserves transcript alignment.
          const combinedAudio = Buffer.concat(renderedParts).toString('base64');
          sendEvent('audio_chunk', {
            index: i,
            audio: combinedAudio,
            transcript: scriptText,
            engine: usedFallback ? FALLBACK_TTS_MODEL : DEFAULT_TTS_MODEL,
          });
        }

        await delay(500);
      }

      sendEvent('done', {
        message: 'Podcast generation complete with ElevenLabs voices.',
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
