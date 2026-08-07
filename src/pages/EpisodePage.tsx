import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { getEpisode, upsertEpisode } from '../lib/storage';
import type { EpisodeRecord } from '../types';

const ACTIVE = new Set(['SUBMITTING','QUEUED','SCRIPTING','AUDIO_QUEUED','SYNTHESIZING','MIXING']);

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status.toLowerCase()}`}>{status.replaceAll('_',' ')}</span>;
}

export function EpisodePage(){
  const { episodeId = '' } = useParams();
  const [episode,setEpisode]=useState<EpisodeRecord|null>(()=>getEpisode(episodeId));
  const [actionBusy,setActionBusy]=useState(false);
  const [actionError,setActionError]=useState('');

  useEffect(()=>{
    const syncLocal=()=>{const local=getEpisode(episodeId);if(local)setEpisode(local);};
    syncLocal(); const localTimer=window.setInterval(syncLocal,900);
    return()=>window.clearInterval(localTimer);
  },[episodeId]);

  useEffect(()=>{
    if(!episode)return;
    const remoteId=episode.remoteId;
    if(!remoteId || !ACTIVE.has(episode.status))return;
    let stopped=false;
    const poll=async()=>{
      try{
        const {episode:remote}=await api.getEpisode(remoteId);
        if(stopped)return;
        const merged={...episode,...remote,id:episode.id,remoteId:remote.id||remote.remoteId||remoteId,updatedAt:new Date().toISOString()};
        upsertEpisode(merged); setEpisode(merged);
      }catch{/* transient polling failures should not turn a healthy background job into a failed episode */}
    };
    poll(); const timer=window.setInterval(poll,4000);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[episode?.remoteId,episode?.status,episode?.id]);

  const assets=episode?.assets||[];
  const playable=useMemo(()=>assets.find(a=>a.kind==='mp3'||a.kind==='m4a'||a.kind==='wav'),[assets]);
  if(!episode)return <div className="page"><Link className="back-link" to="/deep-dives">← BACK TO DEEP DIVES</Link><section className="section-block"><h1>EPISODE NOT FOUND</h1><p>This episode shell is not present on this device.</p></section></div>;

  async function action(kind:'retry'|'cancel'|'audio'){
    if(!episode.remoteId)return;
    setActionBusy(true);setActionError('');
    try{
      const result=kind==='retry'?await api.retryEpisode(episode.remoteId):kind==='cancel'?await api.cancelEpisode(episode.remoteId):await api.generateAudio(episode.remoteId);
      const merged={...episode,...result.episode,id:episode.id,remoteId:result.episode.id||result.episode.remoteId||episode.remoteId};
      upsertEpisode(merged);setEpisode(merged);
    }catch(e:any){setActionError(e?.message||'Action failed.');}
    finally{setActionBusy(false);}
  }

  const canCancel=!!episode.remoteId&&ACTIVE.has(episode.status)&&episode.status!=='SUBMITTING';
  const canRetry=!!episode.remoteId&&episode.status==='FAILED'&&episode.retryable!==false;
  const canGenerateAudio=!!episode.remoteId&&episode.status==='SCRIPT_READY';

  return <div className="page episode-page">
    <Link className="back-link" to="/deep-dives">← BACK TO DEEP DIVES</Link>
    <div className="episode-hero"><div><p className="eyebrow">DEEP DIVE EPISODE</p><h1 className="page-title episode-title">{episode.title}</h1><p>{episode.format} · target {episode.runtime} min · created {new Date(episode.createdAt).toLocaleString()}</p></div><StatusPill status={episode.status}/></div>

    <section className="section-block progress-panel"><div className="progress-head"><div><p className="eyebrow">BACKGROUND JOB</p><h2>{episode.progressMessage}</h2></div><strong>{Math.max(0,Math.min(100,episode.progress||0))}%</strong></div><div className="progress-track"><span style={{width:`${Math.max(2,Math.min(100,episode.progress||0))}%`}}/></div>
      <p className="helper">You can leave this page or close the browser. The generation job belongs to this episode, not to an open Safari request.</p>
      {episode.error&&<div className="inline-error"><b>LAST ERROR</b><br/>{episode.error}</div>}
      {actionError&&<div className="inline-error">{actionError}</div>}
      <div className="episode-actions">
        {canCancel&&<button className="ghost-button" disabled={actionBusy} onClick={()=>action('cancel')}>CANCEL JOB</button>}
        {canRetry&&<button className="primary-button" disabled={actionBusy} onClick={()=>action('retry')}>RETRY FAILED STEP</button>}
        {canGenerateAudio&&<button className="primary-button" disabled={actionBusy} onClick={()=>action('audio')}>GENERATE AUDIO</button>}
        {episode.status==='FAILED'&&!episode.remoteId&&<Link className="secondary-button" to="/studio">RETURN TO STUDIO</Link>}
        {(episode.status==='COMPLETE'||episode.status==='CANCELLED')&&<Link className="secondary-button" to="/studio">CREATE ANOTHER EPISODE</Link>}
      </div>
    </section>

    {playable&&<section className="section-block"><p className="eyebrow">LISTEN</p><h2>FINISHED AUDIO</h2><audio className="episode-player" controls preload="metadata" src={playable.url}/></section>}

    {!!assets.length&&<section className="section-block"><div className="section-heading"><div><p className="eyebrow">EXPORTS</p><h2>DOWNLOADS</h2></div></div><div className="download-grid">{assets.map((asset,i)=><a className="download-card" key={`${asset.kind}-${i}`} href={asset.url} target="_blank" rel="noreferrer"><b>{asset.kind.toUpperCase()}</b><span>{asset.label||'Download file'}</span></a>)}</div></section>}

    {episode.script&&<section className="section-block"><details open={episode.status==='SCRIPT_READY'}><summary>EPISODE SCRIPT / TRANSCRIPT</summary><div className="script-box">{episode.script}</div></details></section>}

    <section className="section-block"><div className="section-heading"><div><p className="eyebrow">JOB HISTORY</p><h2>EPISODE LOG</h2></div></div>{episode.events?.length?<div className="event-list">{[...episode.events].reverse().map((ev,i)=><div className="event-row" key={`${ev.at}-${i}`}><StatusPill status={ev.status}/><div><b>{ev.message}</b><small>{new Date(ev.at).toLocaleString()}</small></div></div>)}</div>:<p className="helper">No detailed worker events have been recorded yet.</p>}</section>
  </div>;
}
