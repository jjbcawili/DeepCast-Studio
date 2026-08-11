export const TTS_VOICES = [
  { name: "Achernar", character: "Soft", pitch: "Higher pitch", provider: "Gemini", defaultFor: "sharpay" },
  { name: "Achird", character: "Friendly", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Algenib", character: "Gravelly", pitch: "Lower pitch", provider: "Gemini" },
  { name: "Algieba", character: "Smooth", pitch: "Lower pitch", provider: "Gemini" },
  { name: "Alnilam", character: "Firm", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Aoede", character: "Breezy", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Autonoe", character: "Bright", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Callirrhoe", character: "Easy-going", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Charon", character: "Informative", pitch: "Lower pitch", provider: "Gemini" },
  { name: "Despina", character: "Smooth", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Enceladus", character: "Breathy", pitch: "Lower pitch", provider: "Gemini" },
  { name: "Erinome", character: "Clear", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Fenrir", character: "Excitable", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Gacrux", character: "Mature", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Iapetus", character: "Clear", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Kore", character: "Firm", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Laomedeia", character: "Upbeat", pitch: "Higher pitch", provider: "Gemini" },
  { name: "Leda", character: "Youthful", pitch: "Higher pitch", provider: "Gemini" },
  { name: "Orus", character: "Firm", pitch: "Lower middle pitch", provider: "Gemini", defaultFor: "jiro" },
  { name: "Puck", character: "Upbeat", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Pulcherrima", character: "Forward", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Rasalgethi", character: "Informative", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Sadachbia", character: "Lively", pitch: "Lower pitch", provider: "Gemini" },
  { name: "Sadaltager", character: "Knowledgeable", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Schedar", character: "Even", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Sulafat", character: "Warm", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Umbriel", character: "Easy-going", pitch: "Lower middle pitch", provider: "Gemini" },
  { name: "Vindemiatrix", character: "Gentle", pitch: "Middle pitch", provider: "Gemini" },
  { name: "Zephyr", character: "Bright", pitch: "Higher pitch", provider: "Gemini" },
  { name: "Zubenelgenubi", character: "Casual", pitch: "Lower middle pitch", provider: "Gemini" },
] as const;

export type TtsVoiceName = (typeof TTS_VOICES)[number]["name"];

export const TTS_VOICE_NAMES = new Set<string>(TTS_VOICES.map((voice) => voice.name));

export function isTtsVoiceName(value: unknown): value is TtsVoiceName {
  return typeof value === "string" && TTS_VOICE_NAMES.has(value);
}
