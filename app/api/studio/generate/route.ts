import { NextResponse } from "next/server";
import { isTtsVoiceName } from "../../../../lib/tts-voices";
import { getVertexExpressClient } from "../../../../lib/google-ai";

type StudioRequest = {
  action?: "script" | "plan" | "script-segment" | "audio" | "audio-turn" | "voice-preview";
  topic?: string;
  format?: "deep-dive" | "debate" | "brief" | "critique";
  length?: string;
  useWebSearch?: boolean;
  source?: string;
  producerInstructions?: string;
  scriptGuidance?: string;
  scriptGuidanceName?: string;
  scriptGuidanceMode?: "guided" | "close";
  allowVerifiedAdditions?: boolean;
  jiroBanter?: number;
  sharpayEnergy?: number;
  script?: string;
  segmentTitle?: string;
  host?: "jiro" | "sharpay";
  hostName?: string;
  voice?: string;
  audioProfile?: string;
  spokenText?: string;
  style?: string;
  pace?: string;
  accent?: string;
  jiroVoice?: string;
  sharpayVoice?: string;
  jiroName?: string;
  sharpayName?: string;
  jiroProfile?: string;
  sharpayProfile?: string;
  jiroStyle?: string;
  sharpayStyle?: string;
  jiroPace?: string;
  sharpayPace?: string;
  jiroAccent?: string;
  sharpayAccent?: string;
  plan?: GeneratedPlan;
  segmentId?: number;
};

type EpisodeOutlineItem = { number: number; title: string; summary: string };

type SegmentGenerationContext = {
  topic: string;
  formatDirection: string;
  jiroName: string;
  sharpayName: string;
  jiroProfile: string;
  sharpayProfile: string;
  jiroDirection: string;
  sharpayDirection: string;
  producerInstructions: string;
  scriptPolicy: string;
  compactGuidance: string;
  compactEvidence: string;
  targetWordsPerSegment: number;
  isFeatureLength: boolean;
  minimumWordsPerSegment: number;
  maximumWordsPerSegment: number;
};

type GeneratedPlan = {
  title: string;
  summary: string;
  outline: EpisodeOutlineItem[];
  generationContext: SegmentGenerationContext;
};

type GeminiContent = {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const utf8Encoder = new TextEncoder();

function utf8Length(value: string) {
  return utf8Encoder.encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number) {
  if (utf8Length(value) <= maxBytes) return value;
  let output = "";
  for (const character of value) {
    if (utf8Length(output + character) > maxBytes) break;
    output += character;
  }
  return output.trim();
}

function splitTranscriptByBytes(value: string, maxBytes = 3_000) {
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const line of lines) {
    if (utf8Length(line) <= maxBytes) {
      const candidate = current ? `${current}\n${line}` : line;
      if (utf8Length(candidate) > maxBytes) push();
      current = current ? `${current}\n${line}` : line;
      continue;
    }

    push();
    const speaker = line.match(/^([^:\n]{1,40}:)\s*/)?.[1] || "";
    const text = speaker ? line.slice(speaker.length).trim() : line;
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    let part = speaker;
    for (const sentence of sentences) {
      const candidate = `${part}${part ? " " : ""}${sentence.trim()}`.trim();
      if (utf8Length(candidate) <= maxBytes) {
        part = candidate;
        continue;
      }
      if (part && part !== speaker) chunks.push(part);
      let remaining = sentence.trim();
      while (utf8Length(`${speaker} ${remaining}`.trim()) > maxBytes) {
        const room = Math.max(400, maxBytes - utf8Length(`${speaker} `));
        const slice = truncateUtf8(remaining, room);
        const boundary = Math.max(slice.lastIndexOf(" "), Math.floor(slice.length * 0.65));
        const safeSlice = slice.slice(0, boundary).trim() || slice;
        chunks.push(`${speaker} ${safeSlice}`.trim());
        remaining = remaining.slice(safeSlice.length).trim();
      }
      part = `${speaker} ${remaining}`.trim();
    }
    current = part;
  }
  push();
  return chunks;
}

function spokenWordCount(value: string) {
  return value
    .replace(/^\s*[^:\n]{1,40}:\s*/gm, "")
    .replace(/\[[^\]]+\]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function cleanSpeakerName(value: unknown, fallback: string) {
  return cleanText(value, 40).replaceAll(":", " ").replaceAll("\n", " ").replace(/\s+/g, " ").trim() || fallback;
}

function getContent(response: unknown): GeminiContent[] {
  if (!response || typeof response !== "object") return [];
  const steps = (response as { steps?: Array<{ content?: GeminiContent[] }> }).steps;
  return Array.isArray(steps) ? steps.flatMap((step) => Array.isArray(step.content) ? step.content : []) : [];
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pcmToWav(pcm: Uint8Array, sampleRate = 24_000) {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) wav[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function wavPcmData(wav: Uint8Array) {
  if (wav.length < 44 || String.fromCharCode(...wav.slice(0, 4)) !== "RIFF") return wav;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = String.fromCharCode(...wav.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "data") return wav.slice(offset + 8, Math.min(wav.length, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  return wav.slice(44);
}

function joinWavParts(parts: Uint8Array[]) {
  const pcmParts = parts.map(wavPcmData);
  const total = pcmParts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of pcmParts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return pcmToWav(joined);
}

type GeminiAudioResult = {
  bytes: Uint8Array;
  mimeType: "audio/wav";
  engine: "Gemini TTS" | "Google Chirp 3 HD";
  fallbackUsed: boolean;
  batchCount?: number;
};

type GoogleServiceAccount = {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  token_uri?: string;
};

let cachedGoogleAccessToken: { value: string; expiresAt: number } | null = null;

async function synthesizeChirpTurn(text: string, voice: string) {
  const accessToken = await getGoogleAccessToken();
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}") as GoogleServiceAccount;
  let lastError = "Google Chirp did not return audio.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(serviceAccount.project_id ? { "x-goog-user-project": serviceAccount.project_id } : {}),
        },
        body: JSON.stringify({
          input: { text: truncateUtf8(text, 3_500) },
          voice: { languageCode: "en-US", name: `en-US-Chirp3-HD-${voice}` },
          audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
        }),
        signal: AbortSignal.timeout(24_000),
      });
      const payload = await response.json().catch(() => ({})) as { audioContent?: string; error?: { message?: string } };
      if (!response.ok || !payload.audioContent) {
        lastError = payload.error?.message || `Google Chirp returned ${response.status}.`;
        if (![429, 500, 502, 503, 504].includes(response.status)) break;
      } else {
        return decodeBase64(payload.audioContent);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(`Google Chirp could not generate audio: ${lastError}`);
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function importablePkcs8(privateKey: string) {
  const body = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAt > now + 90) {
    return cachedGoogleAccessToken.value;
  }

  const rawCredential = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredential) throw new Error("Google Cloud TTS authentication is not configured on this deployment.");

  let credential: GoogleServiceAccount;
  try {
    credential = JSON.parse(rawCredential) as GoogleServiceAccount;
  } catch {
    throw new Error("Google Cloud TTS authentication is invalid.");
  }
  if (
    credential.type !== "service_account"
    || !credential.client_email
    || !credential.private_key
    || !credential.token_uri
  ) {
    throw new Error("Google Cloud TTS authentication is incomplete.");
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify({
    iss: credential.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: credential.token_uri,
    iat: now,
    exp: now + 3_600,
  }));
  const unsignedAssertion = `${header}.${claims}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    importablePkcs8(credential.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedAssertion),
  );
  const assertion = `${unsignedAssertion}.${base64UrlEncode(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(credential.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(`Google Cloud authentication failed: ${tokenPayload.error_description || tokenPayload.error || tokenResponse.status}.`);
  }

  cachedGoogleAccessToken = {
    value: tokenPayload.access_token,
    expiresAt: now + Math.max(300, Number(tokenPayload.expires_in) || 3_600),
  };
  return cachedGoogleAccessToken.value;
}

async function callGemini(body: Record<string, unknown>, retryTransient = false) {
  const attempts = retryTransient ? 3 : 1;
  let lastMessage = "Gemini did not return a response.";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const model = cleanText(body.model, 120);
      const input = cleanText(body.input, 40_000);
      const generationConfig = body.generation_config as {
        speech_config?: Array<{ speaker?: string; voice?: string }>;
      } | undefined;
      const speakers = generationConfig?.speech_config || [];
      const accessToken = await getGoogleAccessToken();
      const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}") as GoogleServiceAccount;

      const transcriptMarker = input.match(/### SPOKEN (?:TRANSCRIPT|DIALOGUE)\s*\n([\s\S]+)$/i);
      // Cloud TTS enforces its input limits in UTF-8 bytes, not JavaScript
      // characters. Keep both fields safely below the provider ceiling.
      const spokenText = truncateUtf8((transcriptMarker?.[1] || input).trim(), 3_000);
      const direction = transcriptMarker
        ? truncateUtf8(input.slice(0, transcriptMarker.index).replace(/\s+/g, " ").trim(), 600)
        : "Perform the supplied text as a natural, polished podcast-host recording.";
      const voice = speakers.length > 1
        ? {
            languageCode: "en-US",
            modelName: model,
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakers.map((speaker, index) => ({
                speakerAlias: cleanSpeakerName(speaker.speaker, `Speaker${index + 1}`).replace(/[^a-z0-9]/gi, "") || `Speaker${index + 1}`,
                speakerId: speaker.voice,
              })),
            },
          }
        : {
            languageCode: "en-US",
            name: speakers[0]?.voice,
            modelName: model,
          };
      const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(serviceAccount.project_id ? { "x-goog-user-project": serviceAccount.project_id } : {}),
        },
        body: JSON.stringify({
          input: { prompt: direction, text: spokenText },
          voice,
          audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
        }),
        // The durable worker request has a shorter outer deadline. Fail this
        // provider attempt early enough to try the stable fallback instead of
        // letting the entire section be cancelled by the platform.
        signal: AbortSignal.timeout(38_000),
      });
      const payload = await response.json().catch(() => ({})) as {
        audioContent?: string;
        error?: { message?: string; status?: string };
      };
      if (!response.ok || !payload.audioContent) {
        const detail = payload.error?.message || payload.error?.status || `Google Cloud TTS returned ${response.status}.`;
        throw new Error(`Google Cloud TTS could not generate audio: ${detail}`);
      }
      return {
        steps: [{
          content: [{
            type: "audio",
            data: payload.audioContent,
            mime_type: "audio/wav",
          }],
        }],
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Gemini request failed.";
      const transient = /\b(429|500|503)\b|quota|temporar|unavailable/i.test(lastMessage);
      if (!transient || attempt === attempts - 1) throw new Error(lastMessage);
    }
  }

  throw new Error(lastMessage);
}

async function callGenerateContent(
  model: string,
  prompt: string,
  systemInstruction: string,
  generationConfig: Record<string, unknown>,
  useGoogleSearch = false,
  timeoutMs = 45_000,
) {
  let response;
  try {
    response = await getVertexExpressClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
        ...generationConfig,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed.";
    const timedOut = error instanceof Error && (
      error.name === "AbortError"
      || error.name === "TimeoutError"
      || /aborted|timed?\s*out/i.test(message)
    );
    if (timedOut) {
      throw new Error("Episode generation timed out while Gemini was preparing the script. Your Studio settings are preserved—please retry the generation.");
    }
    throw error;
  }
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

function parseStructuredJson<T>(raw: string): T {
  const withoutFences = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFences.slice(firstBrace, lastBrace + 1)
    : withoutFences;
  return JSON.parse(candidate) as T;
}

async function callGenerateJson<T>(
  model: string,
  prompt: string,
  systemInstruction: string,
  generationConfig: Record<string, unknown>,
  timeoutMs: number,
  validate: (value: T) => boolean,
  incompleteMessage: string,
) {
  let lastError: unknown;
  // Keep the entire script phase inside the durable Worker's request window.
  // A second attempt uses the stable Flash fallback instead of repeating the
  // same slow request three times.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryInstruction = attempt === 0 ? "" : `

IMPORTANT RETRY: The previous response was incomplete or invalid JSON. Return the entire requested object again as complete, valid JSON. Do not use markdown fences, commentary, or truncate any string.`;
      const configuredMax = Number(generationConfig.maxOutputTokens) || 4_000;
      const retryConfig = {
        ...generationConfig,
        maxOutputTokens: Math.min(16_000, Math.round(configuredMax * (1 + attempt * 0.45))),
      };
      const text = await callGenerateContent(
        attempt === 0 ? model : "gemini-3-flash-preview",
        `${prompt}${retryInstruction}`,
        systemInstruction,
        retryConfig,
        false,
        timeoutMs,
      );
      const parsed = parseStructuredJson<T>(text);
      if (!validate(parsed)) throw new Error(incompleteMessage);
      return parsed;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (attempt === 0 && /\b429\b|resource exhausted|quota|temporar|unavailable/i.test(message)) {
        // Vertex Express can reject a brief burst even when the project and key
        // are healthy. Let the provider recover before the stable-model retry.
        await new Promise((resolve) => setTimeout(resolve, 1_250));
      }
    }
  }
  if (lastError instanceof SyntaxError || /unterminated|string in json|unexpected end|json/i.test(lastError instanceof Error ? lastError.message : "")) {
    throw new Error(`${incompleteMessage} Gemini returned an incomplete response. Your settings are preserved—please retry this generation.`);
  }
  throw lastError instanceof Error ? lastError : new Error(incompleteMessage);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function generateScript(request: StudioRequest) {
  const topic = cleanText(request.topic, 500);
  const source = cleanText(request.source, 30_000);
  const useWebSearch = request.useWebSearch !== false;
  const producerInstructions = cleanText(request.producerInstructions, 2_000);
  const scriptGuidance = cleanText(request.scriptGuidance, 120_000);
  const scriptGuidanceName = cleanText(request.scriptGuidanceName, 160);
  const scriptGuidanceMode = request.scriptGuidanceMode === "close" ? "close" : "guided";
  const allowVerifiedAdditions = request.allowVerifiedAdditions !== false;
  const format = request.format === "debate" || request.format === "brief" || request.format === "critique" ? request.format : "deep-dive";
  const jiroName = cleanSpeakerName(request.jiroName, "Jiro");
  const sharpayName = cleanSpeakerName(request.sharpayName, "Sharpay");
  if (jiroName.toLowerCase() === sharpayName.toLowerCase()) throw new Error("The two hosts need different names.");
  const jiroProfile = cleanText(request.jiroProfile, 800) || "A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.";
  const sharpayProfile = cleanText(request.sharpayProfile, 800) || "A theatrical, slightly nasal, diva-like female host with playful main-character energy; funny, expressive, a little savage, but respectful and accurate.";
  const jiroDirection = `${cleanText(request.jiroStyle, 80) || "Dry Wit"} style, ${cleanText(request.jiroPace, 80) || "Conversational"} pace, ${cleanText(request.jiroAccent, 80) || "American (General)"} accent`;
  const sharpayDirection = `${cleanText(request.sharpayStyle, 80) || "Vocal Smile"} style, ${cleanText(request.sharpayPace, 80) || "Up-tempo"} pace, ${cleanText(request.sharpayAccent, 80) || "American (General)"} accent`;
  const allowedLengths: Record<typeof format, string[]> = {
    "deep-dive": ["15", "30", "45", "60"],
    debate: ["10", "20", "30", "45"],
    brief: ["3", "5", "10", "15"],
    critique: ["10", "20", "30", "45"],
  };
  const defaultLength = { "deep-dive": "30", debate: "20", brief: "5", critique: "20" }[format];
  const requestedLength = request.length || "";
  const flexibleRuntimeSelected = requestedLength === "flexible";
  const materialDepth = source.length + scriptGuidance.length + (producerInstructions.length * 3) + (topic.length * 10) + (useWebSearch ? 4_000 : 0);
  const flexibleIndex = materialDepth >= 22_000 ? 3 : materialDepth >= 9_000 ? 2 : materialDepth >= 2_000 ? 1 : 0;
  const length = flexibleRuntimeSelected
    ? allowedLengths[format][flexibleIndex]
    : allowedLengths[format].includes(requestedLength) ? requestedLength : defaultLength;
  const settings = {
    "3": { minutes: 3, segments: 2, words: 390, maxTokens: 3_000 },
    "5": { minutes: 5, segments: 2, words: 650, maxTokens: 4_000 },
    "10": { minutes: 10, segments: 4, words: 1_300, maxTokens: 7_000 },
    "15": { minutes: 15, segments: 5, words: 1_950, maxTokens: 9_000 },
    "20": { minutes: 20, segments: 7, words: 2_600, maxTokens: 12_000 },
    "30": { minutes: 30, segments: 10, words: 3_900, maxTokens: 16_000 },
    "45": { minutes: 45, segments: 12, words: 7_200, maxTokens: 30_000 },
    "60": { minutes: 60, segments: 15, words: 9_000, maxTokens: 36_000 },
  }[length as "3" | "5" | "10" | "15" | "20" | "30" | "45" | "60"];

  const formatDirection = {
    "deep-dive": "Build a layered, evidence-led exploration with context, chronology, analysis, counterpoints, and a clear narrative arc.",
    debate: `Stage a fair but lively debate. ${jiroName} and ${sharpayName} should hold meaningfully contrasting positions, directly respond to each other, test weak claims, offer rebuttals, and end with a nuanced synthesis rather than a forced winner.`,
    brief: "Deliver a concise, fact-first briefing. Prioritize the essential context, verified developments, why they matter, and a clean takeaway; minimize detours and extended banter.",
    critique: "Evaluate the subject against explicit criteria. Identify strengths, weaknesses, context, execution, impact, and competing interpretations, then finish with a supported critical verdict.",
  }[format];

  if (!topic) throw new Error("Enter a Prompt / Focus before generating.");

  const textModels = ["gemini-3.5-flash", "gemini-3-flash-preview"];
  const researchPrompt = `Research the current factual context needed for a pop-culture podcast about: ${topic}

Use Google Search to verify relevant dates, credits, chart or release claims, and recent developments. Treat the supplied source material as primary context when present. Produce concise internal research notes for another writer; do not write the episode yet. Clearly distinguish verified facts from interpretation.

Supplied source material:
${source || "No source material was supplied."}

Optional user-provided script or transcript guidance:
${scriptGuidance || "No script guidance was supplied."}

If script guidance is present, identify factual claims that need verification and missing context that would materially improve accuracy. The script itself is creative direction, not independent evidence.`;
  let researchNotes = source || "No additional research notes were available. Avoid unsupported factual claims.";

  if (useWebSearch) {
    try {
      researchNotes = await callGenerateContent(
        "gemini-3.5-flash",
        researchPrompt,
        "You are the fact-checking researcher for DeepCast Studio. Verify before asserting and keep the notes concise.",
        { maxOutputTokens: 2_500, temperature: 0.3 },
        true,
        settings.minutes >= 45 ? 6_000 : 9_000,
      );
    } catch {
      // Script generation can still proceed from the selected project sources.
    }
  } else if (!source) {
    researchNotes = "Web Search was turned off and no project sources were selected. Avoid unsupported factual claims.";
  }

  const scriptPolicy = !scriptGuidance
    ? "No script or transcript guidance was supplied."
    : scriptGuidanceMode === "close"
      ? `Follow the supplied script closely: preserve its structure, order, key wording, intended speaker assignments, and argument. Smooth only what is necessary for natural performance.${allowVerifiedAdditions ? " Add or correct concise factual context only when supported by the selected sources or verified research notes." : " Do not add new substantive material; only correct or clearly qualify unsupported factual claims."}`
      : `Use the supplied script as a strong creative blueprint: preserve its core structure, arguments, key wording, and speaker intent while adapting it into natural ${jiroName}/${sharpayName} dialogue.${allowVerifiedAdditions ? " Add verified facts and missing context from selected sources or web research where they materially improve the episode." : " Do not add new substantive material beyond necessary factual corrections or qualifications."}`;

  const prompt = `Create a complete DeepCast Studio ${format.replace("-", " ")} episode about: ${topic}

Audience and editorial lane:
Entertainment, the music industry, main pop girlies, pop culture, gay Twitter, stan Twitter, and adjacent online culture. Keep the analysis smart, funny, specific, and never cruel toward private individuals.

Episode requirements:
- Format direction: ${formatDirection}
- Runtime direction: ${flexibleRuntimeSelected ? `Flexible Runtime was selected. Based on the available material, target approximately ${settings.minutes} minutes while keeping the pacing natural.` : `Target approximately ${settings.minutes} minutes.`}
- Exactly ${settings.segments} titled segments targeting about ${settings.minutes} minutes total and approximately ${settings.words} spoken words.
- Two hosts only. Every spoken line must begin with exactly "${jiroName}:" or "${sharpayName}:".
- ${jiroName} is Host 1: warm, witty, organized, and responsible for keeping chronology, release details, source evidence, and source boundaries clear. Banter level: ${Math.max(10, Math.min(100, Number(request.jiroBanter) || 80))}%. Audio profile: ${jiroProfile} Direction: ${jiroDirection}.
- ${sharpayName} is Host 2: theatrical, slightly nasal, diva-like, playful, expressive, and a little savage while remaining respectful and accurate. Energy level: ${Math.max(10, Math.min(100, Number(request.sharpayEnergy) || 90))}%. Audio profile: ${sharpayProfile} Direction: ${sharpayDirection}.
- Open naturally with ${jiroName} and ${sharpayName} introducing themselves, build a clear arc, and end with a concise sign-off.
- Use the verified research notes and supplied source material as factual context. Never invent citations, quotes, dates, numbers, or credits.
- Write for natural speech. Short paragraphs, clean handoffs, lively but intelligible pacing.
- Audio direction tags such as [laughs], [whispers], or [sarcastically] may be used sparingly when they improve the performance.
- A supplied script is guidance rather than factual evidence. Verify its factual claims against selected sources and research notes. Correct or qualify unsupported claims instead of repeating them as fact.
- If the supplied script uses speaker labels, preserve their intent while normalizing the final labels to exactly "${jiroName}:" and "${sharpayName}:".

Producer instructions:
${producerInstructions || "No additional producer instructions."}

Script guidance policy:
${scriptPolicy}

Optional script / transcript guidance${scriptGuidanceName ? ` (${scriptGuidanceName})` : ""}:
${scriptGuidance || "No script guidance was supplied."}

Source material:
${source || "No source material was supplied."}

Verified research notes:
${researchNotes}

Research scope:
${useWebSearch ? "Web Search was enabled for this episode only. Its findings are temporary generation context and must not be described as saved project sources." : "Web Search was disabled. Use only the selected project sources and general knowledge, and avoid unsupported current claims."}`;

  const planSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: {
        type: "string",
        description: "A concise two-sentence episode summary for the listener library. Explain the subject and the episode's main angle without hype.",
      },
      outline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "integer" },
            title: { type: "string" },
            summary: { type: "string" },
          },
          required: ["number", "title", "summary"],
        },
      },
    },
    required: ["title", "summary", "outline"],
  };

  // A single 30–60 minute response can exceed the Site worker window. Generate a
  // compact editorial plan, then write small segment groups concurrently while
  // preserving the existing response shape expected by the Studio client.
  const compactPlanContext = cleanText([
    `Topic: ${topic}`,
    `Format: ${formatDirection}`,
    `Producer instructions: ${producerInstructions || "None"}`,
    `Script guidance policy: ${scriptPolicy}`,
    `Selected source context:\n${source}`,
    `Verified research notes:\n${researchNotes}`,
  ].join("\n\n"), 22_000);
  const plan = await callGenerateJson<{
    title?: string;
    summary?: string;
    outline?: Array<{ number?: number; title?: string; summary?: string }>;
  }>(
    textModels[0],
    `${compactPlanContext}\n\nCreate the episode plan for approximately ${settings.minutes} minutes. Return only the episode title, two-sentence listener summary, and complete ${settings.segments}-segment outline. Do not write the spoken scripts yet.`,
    "You are the senior producer and fact-disciplined editor for DeepCast Studio. Return only the requested structured episode plan.",
    {
      maxOutputTokens: 5_500,
      temperature: 0.65,
      responseMimeType: "application/json",
      responseJsonSchema: planSchema,
    },
    12_000,
    (value) => Boolean(value.title && value.summary && Array.isArray(value.outline) && value.outline.length > 0),
    "Gemini returned an incomplete episode plan.",
  );

  const normalizedOutline = plan.outline.slice(0, settings.segments).map((item, index) => ({
    number: index + 1,
    title: cleanText(item.title, 180) || `Segment ${index + 1}`,
    summary: cleanText(item.summary, 600) || "Continue the episode's evidence-led narrative arc.",
  }));
  if (normalizedOutline.length !== settings.segments) {
    throw new Error("Gemini returned an incomplete episode outline. Your settings are preserved—please retry.");
  }

  const groups: typeof normalizedOutline[] = [];
  // Feature-length responses were the main source of AbortError failures: asking
  // Gemini for four 4–5 minute sections in one response can exceed the request
  // window. Keep each feature-length call small while running the calls in
  // parallel, so a 45–60 minute episode still finishes within the Site window.
  // One segment per request keeps each model call comfortably below the Site
  // execution window. The durable Queue still owns the overall episode job.
  const groupSize = 1;
  for (let index = 0; index < normalizedOutline.length; index += groupSize) {
    groups.push(normalizedOutline.slice(index, index + groupSize));
  }
  const compactEvidence = cleanText(`${source}\n\n${researchNotes}`, 12_000);
  const compactGuidance = cleanText(scriptGuidance, 8_000);
  const targetWordsPerSegment = Math.max(180, Math.round(settings.words / normalizedOutline.length));
  const isFeatureLength = settings.minutes >= 45;
  const minimumWordsPerSegment = isFeatureLength ? 520 : Math.max(150, Math.round(targetWordsPerSegment * 0.72));
  const maximumWordsPerSegment = isFeatureLength ? 680 : Math.round(targetWordsPerSegment * 1.3);
  const generationContext: SegmentGenerationContext = {
    topic,
    formatDirection,
    jiroName,
    sharpayName,
    jiroProfile,
    sharpayProfile,
    jiroDirection,
    sharpayDirection,
    producerInstructions,
    scriptPolicy,
    compactGuidance,
    compactEvidence,
    targetWordsPerSegment,
    isFeatureLength,
    minimumWordsPerSegment,
    maximumWordsPerSegment,
  };

  if (request.action === "plan") {
    return {
      title: cleanText(plan.title, 220),
      summary: cleanText(plan.summary, 1_200),
      outline: normalizedOutline,
      generationContext,
    } satisfies GeneratedPlan;
  }
  // A 30-minute episode has ten segment requests. Sending all ten at once can
  // trigger Vertex Express 429 RESOURCE_EXHAUSTED even though the API key is
  // valid. Two concurrent writers is the proven-safe shape: requests remain
  // small, but the overall script still fits inside the Site execution window.
  const segmentGroups = await mapWithConcurrency(groups, 2, async (group) => {
    const segmentSchema = {
      type: "object",
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              title: { type: "string" },
              script: { type: "string" },
            },
            required: ["id", "title", "script"],
          },
        },
      },
      required: ["segments"],
    };
    const parsed = await callGenerateJson<{ segments?: Array<{ id?: number; title?: string; script?: string }> }>(
      textModels[0],
      `Write the spoken scripts for the listed segments of the DeepCast episode "${plan.title}" about: ${topic}

Episode format: ${formatDirection}
Hosts: ${jiroName} and ${sharpayName}. Every spoken line must begin with exactly "${jiroName}:" or "${sharpayName}:".
Host direction: ${jiroName} — ${jiroProfile} ${jiroDirection}. ${sharpayName} — ${sharpayProfile} ${sharpayDirection}.
Target ${isFeatureLength ? `${minimumWordsPerSegment}–${maximumWordsPerSegment}` : `approximately ${targetWordsPerSegment}`} spoken words per segment.${isFeatureLength ? " Each segment must perform for roughly 4–5 minutes at a natural conversational pace; do not return a short outline, summary, or abbreviated script." : ""} Keep continuity with the full outline, but return only these segments:
${group.map((item) => `${item.number}. ${item.title}: ${item.summary}`).join("\n")}

Full outline for continuity:
${normalizedOutline.map((item) => `${item.number}. ${item.title}: ${item.summary}`).join("\n")}

Producer instructions:
${producerInstructions || "No additional producer instructions."}

Script guidance policy:
${scriptPolicy}

Optional script guidance:
${compactGuidance || "No script guidance was supplied."}

Verified evidence and selected source context:
${compactEvidence || "No additional evidence was supplied. Avoid unsupported factual claims."}

Write natural speech with clean handoffs. Do not invent facts, quotes, dates, numbers, credits, or citations. Return exactly one segment object for every requested outline number.`,
      "You are the fact-disciplined dialogue writer for DeepCast Studio. Return only the requested segment scripts.",
      {
        maxOutputTokens: Math.min(9_000, Math.max(4_000, group.length * 2_600)),
        temperature: 0.8,
        responseMimeType: "application/json",
        responseJsonSchema: segmentSchema,
      },
      settings.minutes >= 45 ? 18_000 : 14_000,
      (value) => Array.isArray(value.segments) && value.segments.length === group.length,
      "Gemini returned an incomplete segment group. Your settings are preserved—please retry.",
    );
    return parsed.segments!.map((segment, index) => ({
      id: group[index].number,
      title: cleanText(segment.title, 180) || group[index].title,
      script: cleanText(segment.script, 16_000),
    }));
  });
  let segments = segmentGroups.flat().sort((a, b) => a.id - b.id);
  if (segments.length !== normalizedOutline.length || segments.some((segment) => !segment.script)) {
    throw new Error("Gemini returned an incomplete episode script. Your settings are preserved—please retry.");
  }

  // Feature-length episodes must contain feature-length spoken sections. Models
  // occasionally compress a requested section, so repair each underlength
  // section once before any audio synthesis begins.
  if (isFeatureLength) {
    segments = await Promise.all(segments.map(async (segment) => {
      const wordCount = spokenWordCount(segment.script);
      if (wordCount >= minimumWordsPerSegment || wordCount >= Math.round(minimumWordsPerSegment * 0.72)) return segment;
      const repairSchema = {
        type: "object",
        properties: { script: { type: "string" } },
        required: ["script"],
      };
      const repaired = await callGenerateJson<{ script?: string }>(
        textModels[0],
        `Expand segment ${segment.id}, “${segment.title},” from the DeepCast episode “${plan.title}.”

Return a complete two-host spoken script of ${minimumWordsPerSegment}–${maximumWordsPerSegment} words. It must perform for roughly 4–5 minutes at a natural conversational pace. Preserve the existing facts, argument, speaker intent, and continuity; add useful explanation, sourced context, examples, counterpoints, and natural host reactions without padding or invented claims.

Every spoken line must begin with exactly "${jiroName}:" or "${sharpayName}:".

Original segment script:
${segment.script}

Verified evidence and selected source context:
${compactEvidence || "No additional evidence was supplied. Do not invent factual claims."}`,
        "You repair underlength podcast sections. Return only the requested expanded script in structured JSON.",
        {
          maxOutputTokens: 4_500,
          temperature: 0.72,
          responseMimeType: "application/json",
          responseJsonSchema: repairSchema,
        },
        32_000,
        (value) => Boolean(value.script),
        `Gemini returned an incomplete repair for section ${segment.id}.`,
      );
      return { ...segment, script: cleanText(repaired.script, 18_000) };
    }));

    // Reject only genuinely abbreviated sections. Slight variation is natural
    // speech pacing and should not discard an otherwise complete long episode.
    const shortSegments = segments.filter((segment) => spokenWordCount(segment.script) < Math.round(minimumWordsPerSegment * 0.62));
    if (shortSegments.length) {
      throw new Error(`Feature-length validation failed for section ${shortSegments[0].id}. No short episode was saved—please retry that generation.`);
    }
  }

  return { title: plan.title, summary: plan.summary, outline: normalizedOutline, segments };
}

async function generateScriptSegment(request: StudioRequest) {
  const plan = request.plan;
  const segmentId = Math.max(1, Math.round(Number(request.segmentId) || 0));
  if (!plan?.title || !Array.isArray(plan.outline) || !plan.generationContext || !segmentId) {
    throw new Error("The saved episode plan is incomplete for this section.");
  }
  const outlineItem = plan.outline.find((item) => item.number === segmentId);
  if (!outlineItem) throw new Error(`Section ${segmentId} is missing from the saved episode plan.`);
  const context = plan.generationContext;
  const segmentSchema = {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            script: { type: "string" },
          },
          required: ["id", "title", "script"],
        },
      },
    },
    required: ["segments"],
  };
  const parsed = await callGenerateJson<{ segments?: Array<{ id?: number; title?: string; script?: string }> }>(
    "gemini-3.5-flash",
    `Write only section ${segmentId} of the DeepCast episode "${plan.title}" about: ${context.topic}

Episode format: ${context.formatDirection}
Hosts: ${context.jiroName} and ${context.sharpayName}. Every spoken line must begin with exactly "${context.jiroName}:" or "${context.sharpayName}:".
Host direction: ${context.jiroName} — ${context.jiroProfile} ${context.jiroDirection}. ${context.sharpayName} — ${context.sharpayProfile} ${context.sharpayDirection}.
Target ${context.isFeatureLength ? `${context.minimumWordsPerSegment}–${context.maximumWordsPerSegment}` : `approximately ${context.targetWordsPerSegment}`} spoken words.${context.isFeatureLength ? " This section must perform for roughly 4–5 minutes at a natural conversational pace." : ""}

Section to write:
${outlineItem.number}. ${outlineItem.title}: ${outlineItem.summary}

Full outline for continuity:
${plan.outline.map((item) => `${item.number}. ${item.title}: ${item.summary}`).join("\n")}

Producer instructions:
${context.producerInstructions || "No additional producer instructions."}

Script guidance policy:
${context.scriptPolicy}

Optional script guidance:
${context.compactGuidance || "No script guidance was supplied."}

Verified evidence and selected source context:
${context.compactEvidence || "No additional evidence was supplied. Avoid unsupported factual claims."}

Write natural speech with clean handoffs. Do not invent facts, quotes, dates, numbers, credits, or citations. Return exactly one segment object.`,
    "You are the fact-disciplined dialogue writer for DeepCast Studio. Return only the requested segment script.",
    {
      maxOutputTokens: context.isFeatureLength ? 4_800 : 4_000,
      temperature: 0.8,
      responseMimeType: "application/json",
      responseJsonSchema: segmentSchema,
    },
    context.isFeatureLength ? 32_000 : 18_000,
    (value) => Array.isArray(value.segments) && value.segments.length === 1 && Boolean(value.segments[0]?.script),
    `Gemini returned an incomplete script for section ${segmentId}.`,
  );
  let script = cleanText(parsed.segments![0].script, 18_000);
  if (context.isFeatureLength && spokenWordCount(script) < Math.round(context.minimumWordsPerSegment * 0.62)) {
    const repairSchema = { type: "object", properties: { script: { type: "string" } }, required: ["script"] };
    const repaired = await callGenerateJson<{ script?: string }>(
      "gemini-3.5-flash",
      `Expand section ${segmentId}, “${outlineItem.title},” from “${plan.title}” to ${context.minimumWordsPerSegment}–${context.maximumWordsPerSegment} spoken words. Preserve facts, argument, speaker intent, and continuity. Every spoken line must begin with exactly "${context.jiroName}:" or "${context.sharpayName}:".\n\nOriginal script:\n${script}\n\nVerified context:\n${context.compactEvidence}`,
      "You repair underlength podcast sections. Return only the complete expanded script in structured JSON.",
      { maxOutputTokens: 4_800, temperature: 0.72, responseMimeType: "application/json", responseJsonSchema: repairSchema },
      32_000,
      (value) => Boolean(value.script),
      `Gemini returned an incomplete repair for section ${segmentId}.`,
    );
    script = cleanText(repaired.script, 18_000);
  }
  return { id: segmentId, title: cleanText(parsed.segments![0].title, 180) || outlineItem.title, script };
}

async function generateAudio(request: StudioRequest) {
  const script = cleanText(request.script, 12_000);
  const segmentTitle = cleanText(request.segmentTitle, 160) || "DeepCast segment";
  const jiroName = cleanSpeakerName(request.jiroName, "Jiro");
  const sharpayName = cleanSpeakerName(request.sharpayName, "Sharpay");
  if (jiroName.toLowerCase() === sharpayName.toLowerCase()) throw new Error("The two hosts need different names.");
  const jiroVoice = isTtsVoiceName(request.jiroVoice) ? request.jiroVoice : "Orus";
  const sharpayVoice = isTtsVoiceName(request.sharpayVoice) ? request.sharpayVoice : "Achernar";
  const jiroProfile = cleanText(request.jiroProfile, 800) || "A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.";
  const sharpayProfile = cleanText(request.sharpayProfile, 800) || "A theatrical, slightly nasal, diva-like female host with playful main-character energy; funny, expressive, a little savage, but respectful and accurate.";
  const jiroDirection = `${cleanText(request.jiroStyle, 80) || "Dry Wit"} style; ${cleanText(request.jiroPace, 80) || "Conversational"} pace; ${cleanText(request.jiroAccent, 80) || "American (General)"} accent.`;
  const sharpayDirection = `${cleanText(request.sharpayStyle, 80) || "Vocal Smile"} style; ${cleanText(request.sharpayPace, 80) || "Up-tempo"} pace; ${cleanText(request.sharpayAccent, 80) || "American (General)"} accent.`;
  if (!script) throw new Error("The generated segment has no script to synthesize.");

  // Long multi-speaker Gemini TTS calls repeatedly exceed the hosting request
  // window. Synthesize short, ordered host turns with the corresponding Chirp
  // 3 HD voices instead; this preserves casting and completes fast enough for
  // queued episode sections.
  const speakerPattern = new RegExp(`^(${escapeRegExp(jiroName)}|${escapeRegExp(sharpayName)}):\\s*(.+)$`, "i");
  const turns: Array<{ voice: string; text: string }> = [];
  for (const line of script.split(/\n+/).map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(speakerPattern);
    const voice = match?.[1].toLowerCase() === sharpayName.toLowerCase() ? sharpayVoice : jiroVoice;
    const spoken = (match?.[2] || line).trim();
    for (const chunk of splitTranscriptByBytes(spoken, 3_500)) turns.push({ voice, text: chunk });
  }
  if (turns.length) {
    const parts = await mapWithConcurrency(turns, Math.min(6, turns.length), (turn) => synthesizeChirpTurn(turn.text, turn.voice));
    return {
      bytes: joinWavParts(parts),
      mimeType: "audio/wav",
      engine: "Google Chirp 3 HD",
      fallbackUsed: true,
      batchCount: turns.length,
    } satisfies GeminiAudioResult;
  }

  const transcriptChunks = splitTranscriptByBytes(script);
  if (!transcriptChunks.length) throw new Error("The generated segment has no spoken dialogue to synthesize.");

  const makeInput = (transcript: string, chunkIndex: number) => `Synthesize only the spoken podcast transcript below as a polished two-host studio recording.

${jiroName} audio profile: ${jiroProfile}
${jiroName} director's notes: ${jiroDirection}
${sharpayName} audio profile: ${sharpayProfile}
${sharpayName} director's notes: ${sharpayDirection}

Director's notes: Preserve the exact speaker assignments. Use natural breathing, clean handoffs, and expressive delivery. Do not read these instructions, headings, speaker descriptions, or the segment title aloud. Begin only at the spoken transcript.

SEGMENT TITLE: ${segmentTitle}${transcriptChunks.length > 1 ? ` · part ${chunkIndex + 1} of ${transcriptChunks.length}` : ""}
### SPOKEN TRANSCRIPT
${transcript}`;

  const models = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-tts"];
  let lastError: Error | null = null;

  // The queue serializes sections; keep only two provider calls in flight for
  // the current section. Higher fan-out exhausts Gemini TTS capacity and makes
  // the outer request hit its deadline even though each chunk is valid.
  const rendered = await mapWithConcurrency(transcriptChunks, Math.min(2, transcriptChunks.length), async (chunk, chunkIndex) => {
    let chunkError: Error | null = null;
    for (const model of models) {
      try {
        const response = await callGemini({
          model,
          input: makeInput(chunk, chunkIndex),
          response_format: { type: "audio" },
          generation_config: {
            speech_config: [
              { speaker: jiroName, voice: jiroVoice },
              { speaker: sharpayName, voice: sharpayVoice },
            ],
          },
        }, true);
        const audio = getContent(response).find((item) => item.type === "audio" && item.data);
        if (!audio?.data) throw new Error(`Gemini returned no audio for part ${chunkIndex + 1}.`);
        const decoded = decodeBase64(audio.data);
        return audio.mime_type?.toLowerCase().includes("wav") ? decoded : pcmToWav(decoded);
      } catch (error) {
        chunkError = error instanceof Error ? error : new Error("Audio generation failed.");
      }
    }
    throw chunkError || new Error(`Audio generation failed for part ${chunkIndex + 1}.`);
  }).catch((error) => {
    lastError = error instanceof Error ? error : new Error("Audio generation failed.");
    throw lastError;
  });

  return {
    bytes: joinWavParts(rendered),
    mimeType: "audio/wav",
    engine: "Gemini TTS",
    fallbackUsed: false,
    batchCount: transcriptChunks.length,
  } satisfies GeminiAudioResult;
}

async function generateVoicePreview(request: StudioRequest) {
  if (!isTtsVoiceName(request.voice)) throw new Error("Choose a supported Gemini voice.");

  const defaultHostName = request.host === "sharpay" ? "Sharpay" : "Jiro";
  const hostName = cleanSpeakerName(request.hostName, defaultHostName);
  const defaultProfile = request.host === "sharpay"
    ? "A theatrical, slightly nasal, diva-like female host with playful main-character energy; funny, expressive, a little savage, but respectful and accurate."
    : "A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.";
  const audioProfile = cleanText(request.audioProfile, 800) || defaultProfile;
  const style = cleanText(request.style, 80) || "Natural";
  const pace = cleanText(request.pace, 80) || "Conversational";
  const accent = cleanText(request.accent, 80) || "American (General)";
  const spokenLine = request.host === "sharpay"
    ? `And I’m ${hostName}. The receipts are organized, the group chat is seated, and this DeepCast is ready to begin.`
    : `Hi, I’m ${hostName}. Welcome to DeepCast Studio, where the timeline is clear and every pop-culture receipt gets its proper context.`;

  const input = `Synthesize the voice preview below as a polished podcast-host performance.

Audio profile: ${audioProfile}
Director's notes: Use a ${style} style, a ${pace} pace, and a ${accent} accent. Keep the delivery natural, expressive, and easy to understand. Do not read these instructions aloud. Begin only at the spoken transcript.

### SPOKEN TRANSCRIPT
${spokenLine}`;
  const models = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-tts"];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await callGemini({
        model,
        input,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: request.voice }] },
      }, true);
      const audio = getContent(response).find((item) => item.type === "audio" && item.data);
      if (!audio?.data) throw new Error("Gemini returned no audio for this voice preview.");
      const decoded = decodeBase64(audio.data);
      return {
        bytes: audio.mime_type?.toLowerCase().includes("wav") ? decoded : pcmToWav(decoded),
        mimeType: "audio/wav",
        engine: "Gemini TTS",
        fallbackUsed: false,
      } satisfies GeminiAudioResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Voice preview failed.");
    }
  }

  throw lastError || new Error("Voice preview failed.");
}

async function generateDialogueTurn(request: StudioRequest) {
  if (!isTtsVoiceName(request.voice)) throw new Error("Choose a supported Gemini voice.");
  const hostName = cleanSpeakerName(request.hostName, request.host === "sharpay" ? "Sharpay" : "Jiro");
  const spokenText = cleanText(request.spokenText, 2_400);
  if (!spokenText) throw new Error("This dialogue turn is empty.");
  const audioProfile = cleanText(request.audioProfile, 800);
  const direction = `${cleanText(request.style, 80) || "Natural"} style; ${cleanText(request.pace, 80) || "Conversational"} pace; ${cleanText(request.accent, 80) || "American (General)"} accent.`;
  const input = `Perform only the following podcast dialogue as ${hostName}.
Audio profile: ${audioProfile}
Director's notes: ${direction} Keep the delivery natural and conversational. Do not read instructions or the speaker name.

### SPOKEN DIALOGUE
${spokenText}`;
  let lastError: Error | null = null;
  for (const model of ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-tts"]) {
    try {
      const response = await callGemini({
        model,
        input,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: request.voice }] },
      }, true);
      const audio = getContent(response).find((item) => item.type === "audio" && item.data);
      if (!audio?.data) throw new Error("Gemini returned no audio for this dialogue turn.");
      const decoded = decodeBase64(audio.data);
      return { bytes: audio.mime_type?.toLowerCase().includes("wav") ? decoded : pcmToWav(decoded), mimeType: "audio/wav", engine: "Gemini TTS", fallbackUsed: false } satisfies GeminiAudioResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Dialogue synthesis failed.");
    }
  }
  throw lastError || new Error("Dialogue synthesis failed.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as StudioRequest;
    const vertexExpressApiKey = process.env.VERTEX_EXPRESS_API_KEY;
    if (body.action === "script" || body.action === "plan") {
      if (!vertexExpressApiKey) return NextResponse.json({ error: "Vertex AI Express is not configured on this deployment." }, { status: 503 });
      const episode = await generateScript(body);
      return NextResponse.json(episode, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "script-segment") {
      if (!vertexExpressApiKey) return NextResponse.json({ error: "Vertex AI Express is not configured on this deployment." }, { status: 503 });
      const segment = await generateScriptSegment(body);
      return NextResponse.json(segment, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "audio") {
      const audio = await generateAudio(body);
      return new Response(audio.bytes, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store",
          "X-DeepCast-Engine": audio.engine,
          "X-DeepCast-Fallback": String(audio.fallbackUsed),
          "X-DeepCast-Batches": String(audio.batchCount || 1),
        },
      });
    }

    if (body.action === "voice-preview") {
      const audio = await generateVoicePreview(body);
      return new Response(audio.bytes, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store",
          "X-DeepCast-Engine": audio.engine,
          "X-DeepCast-Fallback": String(audio.fallbackUsed),
        },
      });
    }

    if (body.action === "audio-turn") {
      const audio = await generateDialogueTurn(body);
      return new Response(audio.bytes, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store",
          "X-DeepCast-Engine": audio.engine,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported Studio generation action." }, { status: 400 });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Episode generation failed.";
    const timedOut = error instanceof Error && (
      error.name === "AbortError"
      || error.name === "TimeoutError"
      || /operation was aborted|timed?\s*out/i.test(rawMessage)
    );
    const message = timedOut
      ? "Episode generation timed out before the current step completed. Your Studio settings are preserved—please retry the generation."
      : rawMessage;
    return NextResponse.json({ error: message }, { status: timedOut ? 504 : 502 });
  }
}
