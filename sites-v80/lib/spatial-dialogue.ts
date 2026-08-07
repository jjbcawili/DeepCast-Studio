export type DialogueTurn = { host: "jiro" | "sharpay"; text: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseDialogueTurns(script: string, jiroName: string, sharpayName: string): DialogueTurn[] {
  const speaker = new RegExp(`^\\s*(${escapeRegExp(jiroName)}|${escapeRegExp(sharpayName)})\\s*:\\s*(.*)$`, "i");
  const turns: DialogueTurn[] = [];
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(speaker);
    if (match) {
      const host = match[1].toLowerCase() === sharpayName.toLowerCase() ? "sharpay" : "jiro";
      const text = match[2].trim();
      if (!text) continue;
      const previous = turns.at(-1);
      if (previous?.host === host) previous.text += ` ${text}`;
      else turns.push({ host, text });
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${line}`;
    }
  }
  return turns;
}

function encodeWav(buffer: AudioBuffer) {
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = buffer.length * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const write = (offset: number, text: string) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let offset = 44;
  for (let index = 0; index < buffer.length; index += 1) {
    for (const sample of [left[index], right[index]]) {
      view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function renderHostPannedDialogue(parts: Array<{ host: DialogueTurn["host"]; blob: Blob }>) {
  const decodeContext = new AudioContext();
  const decoded: Array<{ host: DialogueTurn["host"]; audio: AudioBuffer }> = [];
  for (const part of parts) decoded.push({ host: part.host, audio: await decodeContext.decodeAudioData(await part.blob.arrayBuffer()) });
  const sampleRate = 48_000;
  const gap = 0.16;
  const duration = decoded.reduce((total, part) => total + part.audio.duration + gap, 0);
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  let start = 0;
  for (const part of decoded) {
    const source = offline.createBufferSource();
    const gain = offline.createGain();
    const panner = offline.createStereoPanner();
    source.buffer = part.audio;
    gain.gain.value = 0.96;
    panner.pan.value = part.host === "jiro" ? -0.55 : 0.55;
    source.connect(gain).connect(panner).connect(offline.destination);
    source.start(start);
    start += part.audio.duration + gap;
  }
  const rendered = await offline.startRendering();
  await decodeContext.close();
  return encodeWav(rendered);
}
