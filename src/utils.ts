export function encodeWAV(audioBuffers: AudioBuffer[], sampleRate = 24000): Blob {
  if (audioBuffers.length === 0) {
    throw new Error('No audio buffers to encode');
  }

  const numChannels = audioBuffers[0].numberOfChannels;

  // Calculate total length in samples
  let totalSamples = 0;
  for (const buffer of audioBuffers) {
    totalSamples += buffer.length;
  }

  // Create an ArrayBuffer for the WAV file
  const buffer = new ArrayBuffer(44 + totalSamples * numChannels * 2);
  const view = new DataView(buffer);

  // Write WAV Header
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * numChannels * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true); // 1 or 2 channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, totalSamples * numChannels * 2, true);

  // Write audio data
  let offset = 44;
  for (const audioBuffer of audioBuffers) {
    if (numChannels === 2) {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      for (let i = 0; i < audioBuffer.length; i++) {
        let l = Math.max(-1, Math.min(1, left[i]));
        view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7FFF, true);
        offset += 2;
        let r = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7FFF, true);
        offset += 2;
      }
    } else {
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < channelData.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

export async function base64ToAudioBuffer(base64: string, audioCtx: AudioContext): Promise<AudioBuffer> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await audioCtx.decodeAudioData(bytes.buffer);
}

export function applyImmersiveAudio(audioCtx: AudioContext, source: AudioBufferSourceNode) {
  // 1. Studio Room Reverb (Synthesized Impulse Response)
  const convolver = audioCtx.createConvolver();
  const rate = audioCtx.sampleRate;
  const length = rate * 1.2; // 1.2s decay
  const impulse = audioCtx.createBuffer(2, length, rate);
  const impulseL = impulse.getChannelData(0);
  const impulseR = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-i / (rate / 4)); // Decay curve
    impulseL[i] = (Math.random() * 2 - 1) * decay;
    impulseR[i] = (Math.random() * 2 - 1) * decay;
  }
  convolver.buffer = impulse;

  // 2. Dry/Wet Mix for Reverb
  const dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.85;
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.20; // Subtle ambient studio reverb

  // 3. Stereo Widening via Haas Effect (Delay one side slightly)
  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(2);
  const delay = audioCtx.createDelay();
  delay.delayTime.value = 0.012; // 12ms delay for stereo width

  // Routing
  source.connect(dryGain);
  source.connect(convolver);
  convolver.connect(wetGain);

  const masterGain = audioCtx.createGain();
  dryGain.connect(masterGain);
  wetGain.connect(masterGain);

  // Apply spatial widening
  masterGain.connect(splitter);
  splitter.connect(merger, 0, 0); // L to L
  splitter.connect(delay, 1);
  delay.connect(merger, 0, 1); // Delayed R to R

  merger.connect(audioCtx.destination);
}

export async function applyImmersiveAudioOffline(audioBuffers: AudioBuffer[], sampleRate = 24000): Promise<AudioBuffer[]> {
  const renderedBuffers: AudioBuffer[] = [];
  
  for (const buffer of audioBuffers) {
    const offlineCtx = new window.OfflineAudioContext(2, buffer.length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    
    // Apply the exact same logic as applyImmersiveAudio
    const convolver = offlineCtx.createConvolver();
    const rate = offlineCtx.sampleRate;
    const length = rate * 1.2; 
    const impulse = offlineCtx.createBuffer(2, length, rate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (rate / 4));
      impulseL[i] = (Math.random() * 2 - 1) * decay;
      impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    convolver.buffer = impulse;

    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 0.85;
    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = 0.20; 

    const splitter = offlineCtx.createChannelSplitter(2);
    const merger = offlineCtx.createChannelMerger(2);
    const delay = offlineCtx.createDelay();
    delay.delayTime.value = 0.012; 

    source.connect(dryGain);
    source.connect(convolver);
    convolver.connect(wetGain);

    const masterGain = offlineCtx.createGain();
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);

    masterGain.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(delay, 1);
    delay.connect(merger, 0, 1);

    merger.connect(offlineCtx.destination);
    
    source.start();
    const renderedBuffer = await offlineCtx.startRendering();
    renderedBuffers.push(renderedBuffer);
  }
  
  return renderedBuffers;
}
