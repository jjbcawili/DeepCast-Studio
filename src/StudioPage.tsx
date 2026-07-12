import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, Download, Mic, PlusCircle, Loader2, FileAudio, Sparkles, Headphones, ChevronDown, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { encodeWAV, base64ToAudioBuffer, applyImmersiveAudio, applyImmersiveAudioOffline } from './utils';

const TRENDING_TOPICS = [
  "The Cultural Reset of 'Brat Summer'",
  "Chappell Roan's Drag-Pop Ascension",
  "Stan Wars & Chart Manipulation on Twitter",
  "The Demise of the 2010s Main Pop Girl",
  "Gay Twitter's Vocabulary Pipeline to Brands",
  "The True Meaning of Camp in 2024",
  "The Grammys & Queer/Black Artists",
  "The 2000s Indie Sleaze Revival",
  "Reality TV's Gay Villains",
  "The Renaissance & Chromatica Tour Films"
];

export default function StudioPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState('15');
  const [customPrompt, setCustomPrompt] = useState('');
  const [host1Profile, setHost1Profile] = useState('');
  const [host2Profile, setHost2Profile] = useState('');
  const [showHostSettings, setShowHostSettings] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [immersiveAudio, setImmersiveAudio] = useState(false);
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const fullAudioListRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingQueueRef = useRef(false);

  const initAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      // Create with 24kHz sample rate since model returns 24kHz
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const handleGenerate = async () => {
    if (!sourceMaterial && !topic) return;
    
    setIsGenerating(true);
    setProgressMsg('Starting generation...');
    setTranscript([]);
    audioQueueRef.current = [];
    fullAudioListRef.current = [];
    isPlayingQueueRef.current = false;
    
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
    }
    
    initAudioCtx();

    try {
      const response = await fetch('/api/generate-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMaterial, topic, length, customPrompt, host1Profile, host2Profile }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        
        for (const part of parts) {
          if (part.startsWith('event: ')) {
            const lines = part.split('\n');
            const eventType = lines[0].replace('event: ', '');
            const dataStr = lines[1].replace('data: ', '');
            
            let data;
            try {
              data = JSON.parse(dataStr);
            } catch(e) {
               continue;
            }

            if (eventType === 'progress') {
              setProgressMsg(data.message);
            } else if (eventType === 'audio_chunk') {
              setTranscript(prev => [...prev, data.transcript]);
              
              if (audioCtxRef.current) {
                try {
                  const audioBuffer = await base64ToAudioBuffer(data.audio, audioCtxRef.current);
                  audioQueueRef.current.push(audioBuffer);
                  fullAudioListRef.current.push(audioBuffer);
                  
                  // Auto-play if not already playing
                  if (!isPlayingQueueRef.current && audioCtxRef.current.state === 'running') {
                    playNextInQueue();
                  }
                } catch (e) {
                  console.error('Error decoding audio chunk:', e);
                }
              }
            } else if (eventType === 'done') {
              setProgressMsg(data.message);
              setIsGenerating(false);
            } else if (eventType === 'error') {
              setProgressMsg('Error: ' + data.message);
              setIsGenerating(false);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setProgressMsg('An error occurred.');
      setIsGenerating(false);
    }
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      setIsPlaying(false);
      return;
    }

    isPlayingQueueRef.current = true;
    setIsPlaying(true);
    
    const buffer = audioQueueRef.current.shift()!;
    const source = audioCtxRef.current!.createBufferSource();
    source.buffer = buffer;
    
    if (immersiveAudio) {
      applyImmersiveAudio(audioCtxRef.current!, source);
    } else {
      source.connect(audioCtxRef.current!.destination);
    }
    
    source.onended = () => {
      playNextInQueue();
    };
    source.start();
    sourceNodeRef.current = source;
  };

  const handlePlayAll = () => {
    initAudioCtx();
    if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
    }
    
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        // Clear the playback queue so it doesn't continue
        audioQueueRef.current = [];
        isPlayingQueueRef.current = false;
        setIsPlaying(false);
      }
    } else {
      if (fullAudioListRef.current.length > 0) {
        // Clone the full list to the queue and play
        audioQueueRef.current = [...fullAudioListRef.current];
        playNextInQueue();
      }
    }
  };

  const handleDownload = async (format: string) => {
    if (fullAudioListRef.current.length === 0) return;
    
    // Notify about formats requiring backend processing
    if (format !== 'WAV' && format !== 'ATMOS') {
      alert(`Exporting high-quality lossless Master WAV.\n\nNote: ${format} compression requires backend processing in the full version. Defaulting to uncompressed Master WAV for now.`);
    }
    
    let buffersToEncode = fullAudioListRef.current;
    if (format === 'ATMOS') {
      buffersToEncode = await applyImmersiveAudioOffline(buffersToEncode);
    }
    
    const wavBlob = encodeWAV(buffersToEncode);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `DeepDive_Audio_Overview_${new Date().getTime()}${format === 'ATMOS' ? '_Atmos' : ''}.wav`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    setShowFormatDropdown(false);
  };

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Header */}
      <header className="h-20 md:h-24 lg:h-28 border-b border-white/10 px-4 sm:px-8 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-10 transition-all">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center">
            {/* Small screens: Emblem only */}
            <img 
              src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" 
              alt="DeepCast Emblem" 
              className="block sm:hidden w-12 h-12 object-contain transition-all"
            />
            {/* Large screens: Alt Title with Emblem */}
            <img 
              src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" 
              alt="DeepCast Studio" 
              className="hidden sm:block h-14 md:h-16 lg:h-20 object-contain transition-all"
            />
          </div>
          
          <nav className="hidden sm:flex items-center gap-4 sm:gap-8">
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors">Home</Link>
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors">Projects</Link>
            <Link to="/studio" className="text-xs font-bold tracking-[0.2em] uppercase text-white hover:text-indigo-400 transition-colors">Deep Dives</Link>
          </nav>

          <button 
            className="sm:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden absolute top-full left-0 right-0 bg-[#080808] border-b border-white/10 p-4 flex flex-col gap-4">
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Projects</Link>
            <Link to="/studio" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Deep Dives</Link>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Input Form */}
        <div className="lg:col-span-5 space-y-8">
          
          <div className="space-y-4 relative z-10">
            <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-[0.85] uppercase">
              Create a<br/><span className="text-indigo-500">Deep Dive</span>
            </h1>
            <p className="text-lg text-zinc-400 font-medium leading-tight max-w-lg">
              Generate a high-quality, multi-host audio podcast discussing your favorite entertainment topics, music industry drama, or iconic pop culture moments.
            </p>
          </div>

          <div className="bg-[#141414] p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6 relative z-10">
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Topic / Focus</label>
              <input
                type="text"
                placeholder="e.g. The impact of Brat Summer, Chappell Roan's rise..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all text-white placeholder:text-zinc-600 font-medium text-sm"
              />
              <div className="pt-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3 block">Trending Now</label>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_TOPICS.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => setTopic(t)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] font-bold tracking-wider uppercase text-zinc-400 hover:text-indigo-400 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex justify-between items-center">
                <span>Source Material <span className="text-zinc-600 font-normal">(Optional)</span></span>
              </label>
              <textarea
                placeholder="Paste articles, tweets, or background context here..."
                value={sourceMaterial}
                onChange={e => setSourceMaterial(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 rounded focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all text-white resize-none placeholder:text-zinc-600 font-medium text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex justify-between items-center">
                <span>Prompt / Focus <span className="text-zinc-600 font-normal">(Optional)</span></span>
              </label>
              <textarea
                placeholder="e.g. Focus specifically on the fashion, or keep it strictly analytical..."
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                className="w-full h-20 px-4 py-3 bg-white/5 border border-white/10 rounded focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all text-white resize-none placeholder:text-zinc-600 font-medium text-sm"
              />
            </div>

            <div className="space-y-4 pt-2">
              <button 
                onClick={() => setShowHostSettings(!showHostSettings)}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
              >
                Host Customization {showHostSettings ? '−' : '+'}
              </button>
              
              {showHostSettings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2 p-4 bg-white/5 border border-white/10 rounded">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Host 1 (Jiro) - Male</label>
                    <textarea
                      placeholder="e.g. warm, witty, organized..."
                      value={host1Profile}
                      onChange={e => setHost1Profile(e.target.value)}
                      className="w-full h-24 px-3 py-2 bg-black/20 border border-white/5 rounded focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all text-white resize-none placeholder:text-zinc-600 font-medium text-xs"
                    />
                    <p className="text-[9px] text-zinc-500">Default: warm, witty, organized, keeps timeline clear.</p>
                  </div>
                  <div className="space-y-2 p-4 bg-white/5 border border-white/10 rounded">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Host 2 (Sharpay) - Female</label>
                    <textarea
                      placeholder="e.g. theatrical, diva-like, funny..."
                      value={host2Profile}
                      onChange={e => setHost2Profile(e.target.value)}
                      className="w-full h-24 px-3 py-2 bg-black/20 border border-white/5 rounded focus:outline-none focus:border-emerald-500 focus:bg-black/40 transition-all text-white resize-none placeholder:text-zinc-600 font-medium text-xs"
                    />
                    <p className="text-[9px] text-zinc-500">Default: theatrical, diva-like, expressive, slightly savage.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Duration Profile</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: '5', label: '~5 Min', desc: 'Summary' },
                  { value: '15', label: '~15 Min', desc: 'Standard' },
                  { value: '45', label: '~45 Min', desc: 'Deep Dive' },
                  { value: '60', label: '~60 Min', desc: 'Extended' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLength(opt.value)}
                    className={`flex flex-col items-center justify-center px-2 py-3 rounded border transition-all ${
                      length === opt.value 
                        ? 'bg-indigo-500 text-white border-indigo-500' 
                        : 'border-white/10 text-zinc-500 hover:border-white/30'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || (!topic && !sourceMaterial)}
              className="w-full h-14 px-8 bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileAudio className="w-5 h-5" />
                  Generate Audio Overview
                </>
              )}
            </button>
          </div>

        </div>

        {/* Right Column: Player & Output */}
        <div className="lg:col-span-7 relative">
          <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
            <h1 className="text-[14rem] font-black leading-none tracking-tighter text-white uppercase italic">AUDIO</h1>
          </div>
          <div className="bg-[#141414] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-140px)] relative z-10">
            
            {/* Player Header */}
            <div className="p-8 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <button
                  onClick={handlePlayAll}
                  disabled={fullAudioListRef.current.length === 0}
                  className={`w-14 h-14 bg-white rounded-full flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                    fullAudioListRef.current.length === 0
                      ? 'opacity-50 bg-white/10 text-zinc-500'
                      : 'text-black hover:bg-zinc-200'
                  }`}
                >
                  {isPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                </button>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold tracking-tight text-white">Audio Output</p>
                    <button 
                      onClick={() => setImmersiveAudio(!immersiveAudio)}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 border ${immersiveAudio ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-transparent text-zinc-500 border-white/10 hover:border-white/30 hover:text-zinc-300'}`}
                      title="Toggle Dolby Atmos / Immersive Spatial Audio"
                    >
                      <Headphones className="w-3 h-3" />
                      {immersiveAudio ? 'ATMOS ON' : 'ATMOS OFF'}
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    {fullAudioListRef.current.length > 0 
                      ? `${fullAudioListRef.current.length} SEGMENTS RENDERED` 
                      : 'AWAITING GENERATION'}
                  </p>
                </div>
              </div>
              
              <div className="relative">
                <button
                  onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                  disabled={fullAudioListRef.current.length === 0}
                  className="h-14 px-6 bg-white/5 border border-white/10 text-white font-black uppercase text-xs tracking-widest hover:bg-white/10 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                
                {showFormatDropdown && fullAudioListRef.current.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded shadow-2xl overflow-hidden z-20">
                    <button onClick={() => handleDownload('WAV')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold tracking-widest uppercase text-white flex items-center justify-between border-b border-white/5 transition-colors">
                      WAV <span className="text-[9px] text-zinc-500">Master</span>
                    </button>
                    <button onClick={() => handleDownload('ATMOS')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold tracking-widest uppercase text-white flex items-center justify-between border-b border-white/5 transition-colors">
                      DOLBY ATMOS <span className="text-[9px] text-indigo-400">Surround</span>
                    </button>
                    <button onClick={() => handleDownload('FLAC')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold tracking-widest uppercase text-white flex items-center justify-between border-b border-white/5 transition-colors">
                      FLAC <span className="text-[9px] text-zinc-500">Lossless</span>
                    </button>
                    <button onClick={() => handleDownload('M4A')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold tracking-widest uppercase text-white flex items-center justify-between border-b border-white/5 transition-colors">
                      M4A <span className="text-[9px] text-zinc-500">HQ AAC</span>
                    </button>
                    <button onClick={() => handleDownload('MP3')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold tracking-widest uppercase text-white flex items-center justify-between transition-colors">
                      MP3 <span className="text-[9px] text-zinc-500">Standard</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Status & Transcript Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-[#080808]/50 to-[#121212]/50">
              
              <AnimatePresence>
                {progressMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded text-[10px] font-bold uppercase tracking-widest"
                  >
                    {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {progressMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {transcript.length === 0 && !isGenerating && (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 text-center">No transcript available.</span>
                </div>
              )}

              <div className="space-y-8 pb-8">
                {transcript.map((chunk, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-px bg-white/10 flex-1"></div>
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                        Segment {idx + 1}
                      </span>
                      <div className="h-px bg-white/10 flex-1"></div>
                    </div>
                    
                    <div className="space-y-4 text-base font-medium leading-relaxed text-zinc-300">
                      {chunk.split('\n').map((line, i) => {
                        if (!line.trim()) return null;
                        
                        // Parse Host1/Host2 for basic formatting
                        if (line.startsWith('Host1:')) {
                          return (
                            <div key={i} className="flex gap-4">
                              <span className="font-black text-indigo-400 min-w-[70px] text-right text-xs uppercase tracking-widest pt-1">Jiro</span>
                              <span className="flex-1">{line.replace('Host1:', '').trim()}</span>
                            </div>
                          );
                        }
                        if (line.startsWith('Host2:')) {
                          return (
                            <div key={i} className="flex gap-4">
                              <span className="font-black text-emerald-400 min-w-[70px] text-right text-xs uppercase tracking-widest pt-1">Sharpay</span>
                              <span className="flex-1">{line.replace('Host2:', '').trim()}</span>
                            </div>
                          );
                        }
                        return <p key={i} className="pl-[76px] italic text-zinc-500">{line}</p>;
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
