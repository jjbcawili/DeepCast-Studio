from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Migration anchor not found: {label}")
    return text.replace(old, new, 1)


# 1) Frontend types
path = "src/types.ts"
text = read(path)
text = replace_once(
    text,
    "  directorsNote: string;\n};",
    "  directorsNote: string;\n  ttsEngine?: 'chatterbox-nano' | 'chatterbox-turbo' | 'kokoro';\n  voiceReferenceKey?: string;\n  voiceReferenceName?: string;\n};",
    "HostConfig voice-cloning fields",
)
write(path, text)

# 2) Browser API helper for authenticated reference upload
path = "src/lib/api.ts"
text = read(path)
text = replace_once(
    text,
    "export const api = {",
    "async function fileToBase64(file: File): Promise<string> {\n"
    "  const bytes = new Uint8Array(await file.arrayBuffer());\n"
    "  let binary = '';\n"
    "  const chunk = 0x8000;\n"
    "  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));\n"
    "  return btoa(binary);\n"
    "}\n\n"
    "export const api = {",
    "fileToBase64 helper",
)
text = replace_once(
    text,
    "  previewVoice: (payload: any) => request<any>('/api/preview-voice', { method: 'POST', body: JSON.stringify(payload) }),",
    "  uploadVoiceReference: async (hostName: string, file: File) => request<{ voiceReferenceKey:string; fileName:string; mimeType:string; size:number }>('/api/voice-references', { method: 'POST', body: JSON.stringify({ hostName, fileName:file.name, mimeType:file.type || 'audio/wav', audioBase64:await fileToBase64(file) }) }),\n"
    "  previewVoice: (payload: any) => request<any>('/api/preview-voice', { method: 'POST', body: JSON.stringify(payload) }),",
    "voice upload API",
)
write(path, text)

# 3) Sites server proxy route
path = "server.ts"
text = read(path)
text = replace_once(
    text,
    "  app.post('/api/preview-voice',(req,res)=>proxy(req,res,'/api/preview-voice'));",
    "  app.post('/api/voice-references',(req,res)=>proxy(req,res,'/api/voice-references'));\n"
    "  app.post('/api/preview-voice',(req,res)=>proxy(req,res,'/api/preview-voice'));",
    "voice-reference proxy",
)
text = text.replace(
    "generationArchitecture:'episode-shell + Cloudflare Queues + Workers AI/Groq + hosted Kokoro/FFmpeg worker + D1/R2',",
    "generationArchitecture:'episode-shell + Cloudflare Queues + Workers AI/Groq + Chatterbox/Kokoro on GitHub Actions + D1/R2',",
)
write(path, text)

# 4) Studio speaker UI and persistence
path = "src/pages/StudioPageV2.tsx"
text = read(path)
text = replace_once(text, "import { useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';", "React useEffect import")
text = replace_once(
    text,
    "const defaultJiro: HostConfig = { name:'Jiro', voice:'am_michael', profile:'A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.', style:'Conversational', pace:'Medium', accent:'Neutral', banter:80, directorsNote:'' };\n"
    "const defaultSharpay: HostConfig = { name:'Sharpay', voice:'af_heart', profile:'A theatrical, expressive female host with playful main-character energy who adds texture, drama, humor, and sharp interpretation without sacrificing accuracy.', style:'Expressive', pace:'Medium', accent:'Neutral', banter:85, directorsNote:'' };",
    "const defaultJiro: HostConfig = { name:'Jiro', voice:'am_michael', profile:'A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.', style:'Conversational', pace:'Medium', accent:'Neutral', banter:80, directorsNote:'', ttsEngine:'chatterbox-nano' };\n"
    "const defaultSharpay: HostConfig = { name:'Sharpay', voice:'af_heart', profile:'A theatrical, expressive female host with playful main-character energy who adds texture, drama, humor, and sharp interpretation without sacrificing accuracy.', style:'Expressive', pace:'Medium', accent:'Neutral', banter:85, directorsNote:'', ttsEngine:'chatterbox-nano' };\n\n"
    "function loadHostConfig(key:string, fallback:HostConfig):HostConfig {\n"
    "  try { const raw=localStorage.getItem(key); return raw ? {...fallback,...JSON.parse(raw)} : fallback; } catch { return fallback; }\n"
    "}",
    "default host clone engines",
)
text = replace_once(
    text,
    "  const [q,setQ] = useState('');\n  const voices = KOKORO_VOICES.filter(v => v.join(' ').toLowerCase().includes(q.toLowerCase()));",
    "  const [q,setQ] = useState('');\n"
    "  const [uploading,setUploading] = useState(false);\n"
    "  const voices = KOKORO_VOICES.filter(v => v.join(' ').toLowerCase().includes(q.toLowerCase()));\n"
    "  const cloneEngine = (host.ttsEngine || 'chatterbox-nano') !== 'kokoro';\n"
    "  async function uploadReference(file?:File) {\n"
    "    if(!file)return; setUploading(true);\n"
    "    try { const saved=await api.uploadVoiceReference(host.name,file); setHost({...host,voiceReferenceKey:saved.voiceReferenceKey,voiceReferenceName:saved.fileName,ttsEngine:host.ttsEngine || 'chatterbox-nano'}); }\n"
    "    finally { setUploading(false); }\n"
    "  }",
    "host upload state",
)
old_picker = "    <div className=\"voice-picker\"><div className=\"voice-picker-head\"><b>Voice</b><span>Kokoro stock voices</span></div><p>Selected: <b>{host.voice}</b></p><input value={q} onChange={e=>setQ(e.target.value)} placeholder=\"Search voices\"/>\n      <div className=\"voice-list\">{voices.map(([name,tone,accent])=><div className={`voice-row ${host.voice===name?'selected':''}`} key={name}><button type=\"button\" className=\"voice-choice\" onClick={()=>setHost({...host,voice:name})}><b>{name}</b><small>{tone} · {accent}</small></button><button type=\"button\" className=\"tiny-button\" onClick={()=>preview(name)}>▶ PREVIEW</button></div>)}</div>\n    </div>"
new_picker = "    <div className=\"voice-picker\"><div className=\"voice-picker-head\"><b>TTS Engine</b><span>{cloneEngine?'Voice cloning':'Legacy stock voice'}</span></div>\n      <label>Engine<select value={host.ttsEngine || 'chatterbox-nano'} onChange={e=>setHost({...host,ttsEngine:e.target.value as HostConfig['ttsEngine']})}><option value=\"chatterbox-nano\">Chatterbox Nano · CPU clone</option><option value=\"chatterbox-turbo\">Chatterbox Turbo · quality clone</option><option value=\"kokoro\">Kokoro · legacy fallback</option></select></label>\n      {cloneEngine ? <div className=\"source-box\"><b>VOICE REFERENCE</b><p className=\"helper\">Use a clean 5–20 second clip with one speaker, no music, and minimal room echo. It is stored privately in DeepCast R2, not committed to GitHub.</p><input type=\"file\" accept=\"audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a\" onChange={e=>uploadReference(e.target.files?.[0])} disabled={uploading}/><p className=\"helper\">{uploading?'Uploading reference…':host.voiceReferenceName?`Saved: ${host.voiceReferenceName}`:'Reference required before generation.'}</p></div> : <>\n        <p>Selected: <b>{host.voice}</b></p><input value={q} onChange={e=>setQ(e.target.value)} placeholder=\"Search voices\"/>\n        <div className=\"voice-list\">{voices.map(([name,tone,accent])=><div className={`voice-row ${host.voice===name?'selected':''}`} key={name}><button type=\"button\" className=\"voice-choice\" onClick={()=>setHost({...host,voice:name})}><b>{name}</b><small>{tone} · {accent}</small></button><button type=\"button\" className=\"tiny-button\" onClick={()=>preview(name)}>▶ PREVIEW</button></div>)}</div>\n      </>}\n    </div>"
text = replace_once(text, old_picker, new_picker, "speaker voice picker")
text = replace_once(text, "  const [jiro,setJiro]=useState(defaultJiro);\n  const [sharpay,setSharpay]=useState(defaultSharpay);", "  const [jiro,setJiro]=useState(()=>loadHostConfig('deepcast:host:jiro',defaultJiro));\n  const [sharpay,setSharpay]=useState(()=>loadHostConfig('deepcast:host:sharpay',defaultSharpay));", "persistent host state")
text = replace_once(
    text,
    "  const [formError,setFormError]=useState('');\n\n  const sourceText=useMemo(()=>{",
    "  const [formError,setFormError]=useState('');\n\n"
    "  useEffect(()=>{ try{localStorage.setItem('deepcast:host:jiro',JSON.stringify(jiro));}catch{} },[jiro]);\n"
    "  useEffect(()=>{ try{localStorage.setItem('deepcast:host:sharpay',JSON.stringify(sharpay));}catch{} },[sharpay]);\n\n"
    "  const sourceText=useMemo(()=>{",
    "host profile persistence",
)
text = text.replace(" setWebSearch(false); setJiro(defaultJiro); setSharpay(defaultSharpay); setProducer('');", " setWebSearch(false); setProducer('');")
text = replace_once(
    text,
    "    if(!prompt.trim()&&!guidance.trim()){setFormError('Add a prompt/focus or script guidance first.'); return;}\n    if(submitting)return;",
    "    if(!prompt.trim()&&!guidance.trim()){setFormError('Add a prompt/focus or script guidance first.'); return;}\n"
    "    for (const [label,host] of [['Jiro',jiro],['Sharpay',sharpay]] as const) { if((host.ttsEngine || 'chatterbox-nano') !== 'kokoro' && !host.voiceReferenceKey){setFormError(`Upload a clean voice reference for ${label} before using Chatterbox.`); return;} }\n"
    "    if(submitting)return;",
    "clone reference validation",
)
text = text.replace(
    "<section className=\"studio-section\"><h2>SPEAKER SETTINGS</h2><p className=\"helper\">Kokoro is the no-per-generation-cost stock-voice path. Jiro and Sharpay remain separately cast and editable; XTTS/Fish Speech can be added later for authorized custom-voice cloning.</p>",
    "<section className=\"studio-section\"><h2>SPEAKER SETTINGS</h2><p className=\"helper\">Chatterbox Nano is the default no-per-character-cost cloning path. Turbo is the higher-quality clone option. Kokoro remains available only as a legacy fallback.</p>",
)
write(path, text)

# 5) TTS dependencies
write("tts-worker/requirements.txt", """gradio==6.8.0
chatterbox-tts==0.1.7
kokoro>=0.9.4
numpy>=1.26.0,<2.0.0
requests>=2.32.0
soundfile>=0.13.1
""")

# 6) Chatterbox adapter
write("tts-worker/chatterbox_engine.py", '''from pathlib import Path

import numpy as np
import requests
import torch
from chatterbox.tts_turbo import ChatterboxTurboTTS

_MODELS = {}


def model_for(engine: str):
    name = str(engine or "chatterbox-nano").strip().lower()
    if name not in {"chatterbox-nano", "chatterbox-turbo"}:
        raise ValueError(f"Unsupported Chatterbox engine: {name}")
    if name not in _MODELS:
        if name == "chatterbox-nano":
            _MODELS[name] = ChatterboxTurboTTS.from_pretrained(device="cpu", nano=True)
        else:
            _MODELS[name] = ChatterboxTurboTTS.from_pretrained(device="cpu")
    return _MODELS[name]


def download_reference(url: str, secret: str, target: Path) -> Path:
    if not url:
        raise ValueError("Chatterbox voice reference URL is missing")
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    with requests.get(url, headers=headers, stream=True, timeout=180) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    handle.write(chunk)
    return target


def synthesize_chatterbox(text: str, engine: str, reference_wav: Path):
    model = model_for(engine)
    with torch.inference_mode():
        wav = model.generate(str(text).strip(), audio_prompt_path=str(reference_wav))
    audio = wav.detach().cpu().float().numpy()
    if audio.ndim == 2:
        audio = audio[0] if audio.shape[0] == 1 else audio.mean(axis=0)
    return np.asarray(audio, dtype=np.float32), int(model.sr)
''')

# 7) Audio worker routes engine per host and downloads private references
path = "tts-worker/app.py"
text = read(path)
text = replace_once(text, "from kokoro import KPipeline", "from kokoro import KPipeline\nfrom chatterbox_engine import download_reference, synthesize_chatterbox", "Chatterbox import")
text = replace_once(
    text,
    "def standard_stereo(audio: np.ndarray):\n    return np.stack([audio, audio], axis=1).astype(np.float32)\n",
    "def standard_stereo(audio: np.ndarray):\n    return np.stack([audio, audio], axis=1).astype(np.float32)\n\n"
    "def resample_audio(audio: np.ndarray, source_rate: int):\n"
    "    if int(source_rate) == SAMPLE_RATE:\n        return audio.astype(np.float32)\n"
    "    duration = len(audio) / float(source_rate)\n"
    "    if duration <= 0:\n        return np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32)\n"
    "    old_x = np.linspace(0.0, duration, num=len(audio), endpoint=False)\n"
    "    new_len = max(1, int(round(duration * SAMPLE_RATE)))\n"
    "    new_x = np.linspace(0.0, duration, num=new_len, endpoint=False)\n"
    "    return np.interp(new_x, old_x, audio).astype(np.float32)\n\n"
    "def engine_for(config: dict):\n"
    "    value = str(config.get('ttsEngine') or os.environ.get('DEEPCAST_TTS_ENGINE') or 'chatterbox-nano').strip().lower()\n"
    "    return value if value in {'chatterbox-nano','chatterbox-turbo','kokoro'} else 'chatterbox-nano'\n",
    "audio engine helpers",
)
start = text.index("def synthesize(payload_json: str) -> str:\n")
end = text.index("\ndef mix(payload_json: str) -> str:\n", start)
new_synthesize = '''def synthesize(payload_json: str) -> str:
    payload = json.loads(payload_json)
    require_secret(payload)
    host1, host2 = payload.get("host1") or {}, payload.get("host2") or {}
    voice1 = safe_voice(host1.get("voice"), "am_michael")
    voice2 = safe_voice(host2.get("voice"), "af_heart")
    turns = parse_dialogue(payload.get("script") or "", host1, host2)
    pieces = []
    spatial = str(payload.get("audioOutput") or "Spatial Stereo").lower().startswith("spatial")
    turn_gap = np.zeros((int(SAMPLE_RATE * 0.18), 2), dtype=np.float32)
    secret = str(payload.get("sharedSecret") or SHARED_SECRET)
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        references = {}
        for slot, config in (("host1", host1), ("host2", host2)):
            engine = engine_for(config)
            if engine.startswith("chatterbox"):
                source = td_path / f"{slot}-reference-source"
                wav_ref = td_path / f"{slot}-reference.wav"
                download_reference(str(config.get("voiceReferenceUrl") or ""), secret, source)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-ac", "1", "-ar", str(SAMPLE_RATE), "-t", "20", str(wav_ref)], check=True)
                references[slot] = wav_ref
        for who, turn_text in turns:
            is_host1 = who.lower() == str(host1.get("name") or "Jiro").lower()
            config = host1 if is_host1 else host2
            slot = "host1" if is_host1 else "host2"
            engine = engine_for(config)
            if engine.startswith("chatterbox"):
                mono, rate = synthesize_chatterbox(turn_text, engine, references[slot])
                mono = resample_audio(mono, rate)
            else:
                voice = voice1 if is_host1 else voice2
                mono = synth_text(turn_text, voice, config.get("pace") or "Medium")
            turn = stereo_turn(mono, -0.16 if is_host1 else 0.16) if spatial else standard_stereo(mono)
            pieces.append(turn)
            pieces.append(turn_gap)
        audio = np.concatenate(pieces, axis=0) if pieces else turn_gap
        wav = td_path / "segment.wav"
        mp3 = td_path / "segment.mp3"
        sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ar", "44100", "-b:a", "128k", str(mp3)], check=True)
        upload(mp3, payload["callbackUrl"])
    return json.dumps({"ok": True, "segmentIndex": payload.get("segmentIndex"), "engines": [engine_for(host1), engine_for(host2)]})
'''
text = text[:start] + new_synthesize + text[end:]
text = text.replace('with gr.Blocks(title="DeepCast Kokoro + FFmpeg Worker") as app:', 'with gr.Blocks(title="DeepCast Chatterbox + Kokoro + FFmpeg Worker") as app:')
text = text.replace('gr.Markdown("# DeepCast Kokoro + FFmpeg Worker\\nPrivate API worker for DeepCast Studio.")', 'gr.Markdown("# DeepCast Chatterbox + Kokoro + FFmpeg Worker\\nPrivate API worker for DeepCast Studio.")')
write(path, text)

# 8) Generic job status language
path = "tts-worker/job.py"
text = read(path)
text = text.replace("GitHub Actions is synthesizing audio segment", "GitHub Actions is synthesizing cloned/stock audio segment")
text = text.replace("The Kokoro/FFmpeg runner failed. Completed segments were preserved.", "The TTS/FFmpeg runner failed. Completed segments were preserved.")
write(path, text)

# 9) GitHub audio workflow: Python 3.11, HF cache, generic dependency naming
path = ".github/workflows/deepcast-audio.yml"
text = read(path)
text = text.replace("description: Kokoro action to run", "description: DeepCast audio action to run")
text = text.replace("python-version: '3.12'", "python-version: '3.11'")
text = replace_once(
    text,
    "      - name: Install FFmpeg and eSpeak NG\n",
    "      - name: Cache Hugging Face model downloads\n"
    "        uses: actions/cache@v4\n"
    "        with:\n"
    "          path: ~/.cache/huggingface\n"
    "          key: deepcast-chatterbox-0.1.7-${{ runner.os }}\n"
    "      - name: Install FFmpeg and eSpeak NG\n",
    "Hugging Face cache",
)
text = text.replace("Install Kokoro worker dependencies", "Install DeepCast TTS worker dependencies")
text = text.replace("Run Kokoro / FFmpeg job", "Run Chatterbox / Kokoro / FFmpeg job")
write(path, text)

# 10) Build QA syntax coverage
path = ".github/workflows/build.yml"
text = read(path)
text = text.replace("Syntax-check hosted Kokoro worker", "Syntax-check DeepCast TTS worker")
text = text.replace("python -m py_compile tts-worker/app.py tts-worker/job.py", "python -m py_compile tts-worker/app.py tts-worker/job.py tts-worker/chatterbox_engine.py")
write(path, text)

# 11) Cloudflare Worker: R2 private voice references + clone-aware audio payloads
path = "cloudflare/src/index.ts"
text = read(path)
helpers_anchor = "async function processJob(job:QueueJob,env:Env){"
helpers = '''function decodeBase64Audio(value:string){
  const clean=String(value||'').replace(/^data:[^,]+,/,'').replace(/\\s+/g,'');
  if(!clean)throw new Error('VOICE_REFERENCE_EMPTY');
  if(clean.length>12_000_000)throw new Error('VOICE_REFERENCE_TOO_LARGE');
  const raw=atob(clean);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;
}
function voiceExt(mime:string){const m=String(mime||'').toLowerCase();if(m.includes('mpeg'))return 'mp3';if(m.includes('mp4')||m.includes('m4a'))return 'm4a';return 'wav';}
async function hostWithVoiceReference(env:Env,userId:string,host:any){
  const copy={...(host||{})};const key=String(copy.voiceReferenceKey||'').trim();if(!key)return copy;
  const head:any=await env.AUDIO.head(key);if(!head||String(head.customMetadata?.userId||'')!==String(userId))throw new Error('VOICE_REFERENCE_NOT_FOUND');
  copy.voiceReferenceUrl=`${env.PUBLIC_BASE_URL}/internal/voice-reference?key=${encodeURIComponent(key)}`;return copy;
}
function ttsLabel(request:any){const names=[request?.host1?.ttsEngine,request?.host2?.ttsEngine].map((v:any)=>String(v||'chatterbox-nano')).filter(Boolean);return [...new Set(names)].join(' + ');}

'''
text = replace_once(text, helpers_anchor, helpers + helpers_anchor, "Cloudflare voice-reference helpers")
text = text.replace(
    "if(url.pathname==='/api/health')return reply({ok:true,architecture:'durable episode shell + queue + D1/R2',audioRunner:env.GITHUB_ACTIONS_TOKEN&&env.GITHUB_REPO?'github-actions':env.KOKORO_SPACE_URL?'hosted-gradio':'unconfigured'},200,cors);",
    "if(url.pathname==='/api/health')return reply({ok:true,architecture:'durable episode shell + queue + D1/R2',audioRunner:env.GITHUB_ACTIONS_TOKEN&&env.GITHUB_REPO?'github-actions':env.KOKORO_SPACE_URL?'hosted-gradio':'unconfigured',ttsEngines:['chatterbox-nano','chatterbox-turbo','kokoro'],voiceCloning:'private-r2-reference-audio'},200,cors);",
)
text = replace_once(
    text,
    "    if(url.pathname==='/api/episodes'&&req.method==='POST'){",
    "    if(url.pathname==='/api/voice-references'&&req.method==='POST'){\n"
    "      const u=await requestUser(req,env);const b:any=await req.json();const mime=String(b.mimeType||'audio/wav').toLowerCase();\n"
    "      if(!['audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a'].includes(mime))return reply({error:'Use WAV, MP3, or M4A for a voice reference.'},415,cors);\n"
    "      const bytes=decodeBase64Audio(String(b.audioBase64||''));if(bytes.byteLength>8*1024*1024)return reply({error:'Voice reference must be 8 MB or smaller.'},413,cors);\n"
    "      const key=`voice-references/${u.uid}/${id('voice')}.${voiceExt(mime)}`;const fileName=String(b.fileName||`voice-reference.${voiceExt(mime)}`).slice(0,180);const hostName=String(b.hostName||'Host').slice(0,80);\n"
    "      await env.AUDIO.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{userId:u.uid,hostName,fileName}});\n"
    "      return reply({voiceReferenceKey:key,fileName,mimeType:mime,size:bytes.byteLength},201,cors);\n"
    "    }\n"
    "    if(url.pathname==='/api/episodes'&&req.method==='POST'){",
    "Cloudflare voice upload route",
)
text = text.replace("'Script complete. Audio segments are queued for Kokoro on a background compute runner.'", "'Script complete. Audio segments are queued for the selected TTS engine on a background compute runner.'")
text = text.replace("'Workers AI / Groq → Kokoro → FFmpeg'", "`Workers AI / Groq → ${ttsLabel(request)} → FFmpeg`")
text = text.replace("`Dispatching audio segment ${i+1} of ${row.expected_segments} to the Kokoro compute runner.`", "`Dispatching audio segment ${i+1} of ${row.expected_segments} to the TTS compute runner.`")
old_payload = "      return reply({episodeId,segmentIndex:i,script:seg.script,host1:request.host1||{},host2:request.host2||{},audioOutput:request.audioOutput||'Spatial Stereo',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${episodeId}/${i}?kind=segment&ext=mp3`},200,cors);"
new_payload = "      const host1=await hostWithVoiceReference(env,row.user_id,request.host1||{});const host2=await hostWithVoiceReference(env,row.user_id,request.host2||{});\n      return reply({episodeId,segmentIndex:i,script:seg.script,host1,host2,audioOutput:request.audioOutput||'Spatial Stereo',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${episodeId}/${i}?kind=segment&ext=mp3`},200,cors);"
text = replace_once(text, old_payload, new_payload, "clone-aware internal audio payload")
text = replace_once(
    text,
    "    if(url.pathname==='/internal/audio-object'&&req.method==='GET'){",
    "    if(url.pathname==='/internal/voice-reference'&&req.method==='GET'){if(!env.TTS_SHARED_SECRET||req.headers.get('authorization')!==`Bearer ${env.TTS_SHARED_SECRET}`)return new Response('Forbidden',{status:403});const key=url.searchParams.get('key');if(!key)return new Response('Missing key',{status:400});const obj:any=await env.AUDIO.get(key);if(!obj)return new Response('Not found',{status:404});const h=new Headers();h.set('Content-Type',String(obj.httpMetadata?.contentType||'application/octet-stream'));h.set('Cache-Control','private, no-store');return new Response(obj.body,{headers:h});}\n"
    "    if(url.pathname==='/internal/audio-object'&&req.method==='GET'){",
    "private voice-reference download route",
)
write(path, text)

print("Chatterbox voice-cloning migration applied successfully.")
