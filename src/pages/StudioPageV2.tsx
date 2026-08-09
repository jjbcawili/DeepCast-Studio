import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KOKORO_VOICES } from '../data/kokoroVoices';
import { api } from '../lib/api';
import { getProjects, makeId, upsertEpisode, patchEpisode } from '../lib/storage';
import { useAuth } from '../auth/AuthContext';
import type { EpisodeRecord, HostConfig } from '../types';

const defaultJiro: HostConfig = { name:'Jiro', voice:'am_michael', profile:'A warm, witty, organized male host who keeps the timeline, release details, source evidence, and source boundaries clear.', style:'Conversational', pace:'Medium', accent:'Neutral', banter:80, directorsNote:'', ttsEngine:'chatterbox-nano' };
const defaultSharpay: HostConfig = { name:'Sharpay', voice:'af_heart', profile:'A theatrical, expressive female host with playful main-character energy who adds texture, drama, humor, and sharp interpretation without sacrificing accuracy.', style:'Expressive', pace:'Medium', accent:'Neutral', banter:85, directorsNote:'', ttsEngine:'chatterbox-nano' };

function loadHostConfig(key:string, fallback:HostConfig):HostConfig {
  try { const raw=localStorage.getItem(key); return raw ? {...fallback,...JSON.parse(raw)} : fallback; } catch { return fallback; }
}

function HostEditor({ label, host, setHost }: { label:string; host:HostConfig; setHost:(h:HostConfig)=>void }) {
  const [q,setQ] = useState('');
  const [uploading,setUploading] = useState(false);
  const voices = KOKORO_VOICES.filter(v => v.join(' ').toLowerCase().includes(q.toLowerCase()));
  const cloneEngine = (host.ttsEngine || 'chatterbox-nano') !== 'kokoro';
  async function uploadReference(file?:File) {
    if(!file)return; setUploading(true);
    try { const saved=await api.uploadVoiceReference(host.name,file); setHost({...host,voiceReferenceKey:saved.voiceReferenceKey,voiceReferenceName:saved.fileName,ttsEngine:host.ttsEngine || 'chatterbox-nano'}); }
    finally { setUploading(false); }
  }
  async function preview(voice: string) {
    try {
      const d = await api.previewVoice({ hostName:host.name, voice, style:host.style, pace:host.pace, accent:host.accent });
      if (d.url) new Audio(d.url).play();
      else if (d.audio) new Audio(`data:${d.mimeType || 'audio/wav'};base64,${d.audio}`).play();
    } catch { /* preview failure must never block episode creation */ }
  }
  return <div className="host-card">
    <div className="host-badge">{label} <b>{host.name}</b><span>{host.voice}</span></div>
    <label>Host Name<input value={host.name} onChange={e=>setHost({...host,name:e.target.value})}/></label>
    <label>Audio Profile<textarea value={host.profile} onChange={e=>setHost({...host,profile:e.target.value})}/></label>
    <label>Banter Level <b>{host.banter}%</b><input type="range" min="0" max="100" value={host.banter} onChange={e=>setHost({...host,banter:Number(e.target.value)})}/></label>
    <label>Director's Note<textarea value={host.directorsNote} onChange={e=>setHost({...host,directorsNote:e.target.value})} placeholder="Applied to the generated performance"/></label>
    <div className="three-col">
      <label>Style<select value={host.style} onChange={e=>setHost({...host,style:e.target.value})}><option>Conversational</option><option>Expressive</option><option>Warm</option><option>Dry</option><option>Dramatic</option></select></label>
      <label>Pace<select value={host.pace} onChange={e=>setHost({...host,pace:e.target.value})}><option>Slow</option><option>Medium</option><option>Fast</option></select></label>
      <label>Accent<select value={host.accent} onChange={e=>setHost({...host,accent:e.target.value})}><option>Neutral</option><option>American</option><option>British</option><option>Filipino English</option></select></label>
    </div>
    <div className="voice-picker"><div className="voice-picker-head"><b>TTS Engine</b><span>{cloneEngine?'Voice cloning':'Legacy stock voice'}</span></div>
      <label>Engine<select value={host.ttsEngine || 'chatterbox-nano'} onChange={e=>setHost({...host,ttsEngine:e.target.value as HostConfig['ttsEngine']})}><option value="chatterbox-nano">Chatterbox Nano · CPU clone</option><option value="chatterbox-turbo">Chatterbox Turbo · quality clone</option><option value="kokoro">Kokoro · legacy fallback</option></select></label>
      {cloneEngine ? <div className="source-box"><b>VOICE REFERENCE</b><p className="helper">Use a clean 5–20 second clip with one speaker, no music, and minimal room echo. It is stored privately in DeepCast R2, not committed to GitHub.</p><input type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a" onChange={e=>uploadReference(e.target.files?.[0])} disabled={uploading}/><p className="helper">{uploading?'Uploading reference…':host.voiceReferenceName?`Saved: ${host.voiceReferenceName}`:'Reference required before generation.'}</p></div> : <>
        <p>Selected: <b>{host.voice}</b></p><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search voices"/>
        <div className="voice-list">{voices.map(([name,tone,accent])=><div className={`voice-row ${host.voice===name?'selected':''}`} key={name}><button type="button" className="voice-choice" onClick={()=>setHost({...host,voice:name})}><b>{name}</b><small>{tone} · {accent}</small></button><button type="button" className="tiny-button" onClick={()=>preview(name)}>▶ PREVIEW</button></div>)}</div>
      </>}
    </div>
  </div>;
}

export function StudioPage(){
  const navigate = useNavigate();
  const auth = useAuth();
  const projects = getProjects();
  const [title,setTitle]=useState('');
  const [prompt,setPrompt]=useState('');
  const [guidance,setGuidance]=useState('');
  const [mode,setMode]=useState<'guided'|'follow'>('guided');
  const [verified,setVerified]=useState(true);
  const [format,setFormat]=useState('Deep Dive');
  const [runtime,setRuntime]=useState('45');
  const [projectId,setProjectId]=useState('');
  const project=projects.find(p=>p.id===projectId);
  const [selectedSources,setSelectedSources]=useState<string[]>([]);
  const [pasted,setPasted]=useState('');
  const [webSearch,setWebSearch]=useState(false);
  const [jiro,setJiro]=useState(()=>loadHostConfig('deepcast:host:jiro',defaultJiro));
  const [sharpay,setSharpay]=useState(()=>loadHostConfig('deepcast:host:sharpay',defaultSharpay));
  const [producer,setProducer]=useState('');
  const [musicMode,setMusicMode]=useState('none');
  const [coverMode,setCoverMode]=useState('none');
  const [downloadFormat,setDownloadFormat]=useState('MP3');
  const [audioOutput,setAudioOutput]=useState('Spatial Stereo');
  const [submitting,setSubmitting]=useState(false);
  const [formError,setFormError]=useState('');

  useEffect(()=>{ try{localStorage.setItem('deepcast:host:jiro',JSON.stringify(jiro));}catch{} },[jiro]);
  useEffect(()=>{ try{localStorage.setItem('deepcast:host:sharpay',JSON.stringify(sharpay));}catch{} },[sharpay]);

  const sourceText=useMemo(()=>{
    const chosen=project?.sources.filter(s=>selectedSources.includes(s.id)).map(s=>`SOURCE: ${s.title}\n${s.content||s.url||''}`)||[];
    if(pasted.trim())chosen.push(`PASTED SOURCE MATERIAL:\n${pasted}`);
    return chosen.join('\n\n');
  },[project,selectedSources,pasted]);

  function toggleSource(id:string){setSelectedSources(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
  function clearStudio(){
    setTitle(''); setPrompt(''); setGuidance(''); setMode('guided'); setVerified(true); setFormat('Deep Dive'); setRuntime('45'); setProjectId(''); setSelectedSources([]); setPasted(''); setWebSearch(false); setProducer(''); setMusicMode('none'); setCoverMode('none'); setDownloadFormat('MP3'); setAudioOutput('Spatial Stereo'); setFormError('');
  }

  async function generate(){
    if(!prompt.trim()&&!guidance.trim()){setFormError('Add a prompt/focus or script guidance first.'); return;}
    for (const [label,host] of [['Jiro',jiro],['Sharpay',sharpay]] as const) { if((host.ttsEngine || 'chatterbox-nano') !== 'kokoro' && !host.voiceReferenceKey){setFormError(`Upload a clean voice reference for ${label} before using Chatterbox.`); return;} }
    if(submitting)return;
    setSubmitting(true); setFormError('');
    const now=new Date().toISOString();
    const localId=makeId('episode');
    const record:EpisodeRecord={
      id:localId,
      title:title.trim()||'Untitled Deep Dive',
      prompt:prompt.trim()||guidance.slice(0,180),
      projectId:projectId||undefined,
      format,
      runtime,
      createdAt:now,
      updatedAt:now,
      status:'SUBMITTING',
      progress:2,
      progressMessage:'Submitting this episode to the background generation queue…',
      retryable:true,
      assets:[],
      events:[{at:now,status:'SUBMITTING',message:'Episode shell created. Studio released for a new episode.'}],
    };
    upsertEpisode(record);
    const payload={localEpisodeId:localId,episodeTitle:record.title,prompt:record.prompt,projectId:projectId||undefined,format,runtime,scriptGuidance:guidance,guidanceMode:mode,allowVerifiedAdditions:verified,sourceMaterial:sourceText,webSearch,producerInstructions:producer,host1:jiro,host2:sharpay,downloadFormat,audioOutput,musicMode,coverMode};

    clearStudio();
    navigate(`/deep-dives/${localId}`);

    try{
      await auth.ensureIdentity();
      const {episode}=await api.submitEpisode(payload);
      upsertEpisode({...record,...episode,id:localId,remoteId:episode.id||episode.remoteId,updatedAt:new Date().toISOString()});
    }catch(e:any){
      const at=new Date().toISOString();
      patchEpisode(localId,{status:'FAILED',progressMessage:'Episode submission failed before the queue accepted it.',error:e?.message||'Submission failed.',retryable:true,events:[...(record.events||[]),{at,status:'FAILED',message:e?.message||'Submission failed.'}]});
    }finally{setSubmitting(false);}
  }

  return <div className="page studio-page">
    <Link className="back-link" to="/deep-dives">← BACK TO DEEP DIVES</Link>
    <p className="eyebrow">✦ DEEPCAST STUDIO</p><h1 className="page-title">CUSTOMIZE YOUR DEEP DIVE EPISODE</h1>
    <p>Build the episode here. The moment you press Generate Audio, DeepCast creates a dedicated episode shell, sends the work to the background queue, clears Studio, and moves every progress update or failure into that episode page.</p>
    <div className="studio-contract"><b>BACKGROUND MODE</b><span>No long-running browser stream. Closing Safari or switching tabs will not be the job runner.</span></div>

    <section className="studio-section"><h2>EPISODE FOCUS</h2>
      <div className="two-col-form"><label>Episode Title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Optional — DeepCast can title it later"/></label><label>Project<select value={projectId} onChange={e=>{setProjectId(e.target.value);setSelectedSources([])}}><option value="">Standalone Deep Dive</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div>
      <label>Prompt / Focus<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="What should the AI hosts focus on in this episode?"/></label>
      <label>Script / Transcript Guidance<textarea value={guidance} onChange={e=>setGuidance(e.target.value)} placeholder="Optional outline, transcript, beats, or exact guidance to follow"/></label>
      <div className="segmented"><button className={mode==='guided'?'active':''} onClick={()=>setMode('guided')}>GUIDED ADAPTATION</button><button className={mode==='follow'?'active':''} onClick={()=>setMode('follow')}>FOLLOW CLOSELY</button></div>
      <label className="toggle"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/><small>Allow source-verified additions when they improve accuracy or context</small></label>
      <div className="two-col-form"><label>Runtime<select value={runtime} onChange={e=>setRuntime(e.target.value)}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label><label>Format<select value={format} onChange={e=>setFormat(e.target.value)}><option>Deep Dive</option><option>Debate</option><option>Brief</option><option>Critique</option></select></label></div>
    </section>

    <section className="studio-section"><h2>RESEARCH & SOURCES</h2><p className="helper">Project sources stay first. Episode web-search intent applies only to this Deep Dive.</p>
      {project&&<div className="source-box"><b>{project.title} SOURCES</b>{project.sources.length?project.sources.map(s=><label className="source-check" key={s.id}><input type="checkbox" checked={selectedSources.includes(s.id)} onChange={()=>toggleSource(s.id)}/><span>{s.title}<small>{s.type}</small></span></label>):<p className="helper">No project sources yet.</p>}</div>}
      <label>Source Material<textarea value={pasted} onChange={e=>setPasted(e.target.value)} placeholder="Paste notes, excerpts, URLs, or source material for this episode"/></label>
      <label className="toggle"><input type="checkbox" checked={webSearch} onChange={e=>setWebSearch(e.target.checked)}/><small>Enable web research for this episode when the background backend supports it</small></label>
    </section>

    <section className="studio-section"><h2>SPEAKER SETTINGS</h2><p className="helper">Chatterbox Nano is the default no-per-character-cost cloning path. Turbo is the higher-quality clone option. Kokoro remains available only as a legacy fallback.</p><div className="host-grid"><HostEditor label="HOST 1" host={jiro} setHost={setJiro}/><HostEditor label="HOST 2" host={sharpay} setHost={setSharpay}/></div></section>

    <section className="studio-section"><h2>PRODUCTION</h2><label>Producer Instructions<textarea value={producer} onChange={e=>setProducer(e.target.value)} placeholder="Tone, pacing, transitions, fact discipline, banter, segment priorities…"/></label>
      <div className="two-col-form"><label>Background Music<select value={musicMode} onChange={e=>setMusicMode(e.target.value)}><option value="none">None</option><option value="subtle" disabled>Subtle bed + ducking — deploy audio-bed lane first</option><option value="cinematic" disabled>Cinematic bed + ducking — deploy audio-bed lane first</option></select></label><label>Cover Art<select value={coverMode} onChange={e=>setCoverMode(e.target.value)}><option value="none">None</option><option value="auto" disabled>Auto — cover generator not deployed yet</option><option value="project" disabled>Use project art — R2 cover sync not deployed yet</option></select></label></div>
      <div className="two-col-form"><label>Primary Download<select value={downloadFormat} onChange={e=>setDownloadFormat(e.target.value)}><option>MP3</option><option>M4A</option><option>WAV</option></select></label><label>Audio Output<select value={audioOutput} onChange={e=>setAudioOutput(e.target.value)}><option>Spatial Stereo</option><option>Standard Stereo</option><option disabled>Surround — multichannel encoder not deployed yet</option><option disabled>Dolby Atmos — licensed Atmos encoder not deployed</option></select></label></div>
      {formError&&<div className="inline-error">{formError}</div>}
      <button className="generate-button" onClick={generate} disabled={submitting}>▶ {submitting?'CREATING EPISODE…':'GENERATE AUDIO'}</button>
      <p className="helper">Generate Audio creates the episode first. Queue state, script progress, retries, audio generation, exports, and errors belong to that episode page, not this Studio.</p>
    </section>
  </div>;
}
