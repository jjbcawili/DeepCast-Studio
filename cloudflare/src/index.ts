import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

type Env = {
  DB: any; AUDIO: any; AI: any; EPISODE_QUEUE: any;
  FIREBASE_PROJECT_ID: string; PUBLIC_BASE_URL: string; SCRIPT_MODEL?: string;
  GROQ_API_KEY?: string; GROQ_MODEL?: string; KOKORO_SPACE_URL?: string;
  TTS_SHARED_SECRET?: string; HF_TOKEN?: string; MAX_DAILY_EPISODES?: string;
  GITHUB_ACTIONS_TOKEN?: string; GITHUB_REPO?: string; GITHUB_AUDIO_WORKFLOW?: string; GITHUB_AUDIO_REF?: string;
};
type QueueJob = { kind:'plan'|'script_segment'|'audio_segment'|'mix_episode'; episodeId:string; segmentIndex?:number };

const segmentWordTarget=(runtime:string)=>Number(runtime)>=60?'520-580':Number(runtime)>=45?'500-560':Number(runtime)>=30?'480-540':'380-440';

const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const now=()=>new Date().toISOString();
const id=(prefix='id')=>`${prefix}_${crypto.randomUUID()}`;
const cleanJson=(s:string)=>s.replace(/```json/gi,'').replace(/```/g,'').trim();
const segmentCount=(runtime:string)=>Number(runtime)>=60?16:Number(runtime)>=45?12:Number(runtime)>=30?8:5;
function reply(data:any,status=200,extra:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}})}
function originHeaders(req:Request){const o=req.headers.get('origin')||'*';return {'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Vary':'Origin'};}

async function firebaseUser(req:Request,env:Env){
  const auth=req.headers.get('authorization')||''; if(!auth.startsWith('Bearer '))throw new Error('AUTH_REQUIRED');
  const token=auth.slice(7); const header=decodeProtectedHeader(token); if(!header.kid)throw new Error('INVALID_TOKEN');
  const certs:any=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{cf:{cacheTtl:3600,cacheEverything:true} as any}).then(r=>r.json());
  const cert=certs[header.kid]; if(!cert)throw new Error('INVALID_TOKEN_KEY');
  const key=await importX509(cert,'RS256');
  const {payload}=await jwtVerify(token,key,{issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,audience:env.FIREBASE_PROJECT_ID,algorithms:['RS256']});
  if(!payload.sub)throw new Error('INVALID_TOKEN_SUBJECT');
  return {uid:String(payload.sub),email:payload.email?String(payload.email):undefined,name:payload.name?String(payload.name):undefined};
}
async function event(env:Env,episodeId:string,status:string,message:string){await env.DB.prepare('INSERT INTO episode_events(episode_id,status,message,created_at) VALUES(?,?,?,?)').bind(episodeId,status,message,now()).run();}
async function setEpisode(env:Env,episodeId:string,status:string,progress:number,message:string,extra:{error?:string|null;failedStage?:string|null;retryable?:number;script?:string;engine?:string}={}){
  await env.DB.prepare(`UPDATE episodes SET status=?,progress=?,progress_message=?,error=?,failed_stage=?,retryable=?,script=COALESCE(?,script),engine=COALESCE(?,engine),updated_at=? WHERE id=?`).bind(status,progress,message,extra.error??null,extra.failedStage??null,extra.retryable??1,extra.script??null,extra.engine??null,now(),episodeId).run();
  await event(env,episodeId,status,message);
}
async function getEpisodeRow(env:Env,episodeId:string){return env.DB.prepare('SELECT * FROM episodes WHERE id=?').bind(episodeId).first();}
async function episodeJson(env:Env,row:any){
  const events=(await env.DB.prepare('SELECT status,message,created_at FROM episode_events WHERE episode_id=? ORDER BY id ASC LIMIT 100').bind(row.id).all()).results||[];
  const assets=(await env.DB.prepare('SELECT kind,label,access_token FROM episode_assets WHERE episode_id=? ORDER BY created_at ASC').bind(row.id).all()).results||[];
  return {id:row.id,remoteId:row.id,title:row.title,prompt:row.prompt,projectId:row.project_id||undefined,format:row.format,runtime:row.runtime,script:row.script||undefined,createdAt:row.created_at,updatedAt:row.updated_at,engine:row.engine||undefined,status:row.status,progress:row.progress,progressMessage:row.progress_message,error:row.error||undefined,retryable:!!row.retryable,events:events.map((e:any)=>({at:e.created_at,status:e.status,message:e.message})),assets:assets.map((a:any)=>({kind:a.kind,label:a.label||undefined,url:`${env.PUBLIC_BASE_URL}/public/assets/${a.access_token}`}))};
}
async function assertOwner(req:Request,env:Env,episodeId:string){const u=await firebaseUser(req,env);const row=await getEpisodeRow(env,episodeId);if(!row)throw new Error('NOT_FOUND');if(row.user_id!==u.uid)throw new Error('FORBIDDEN');return {u,row};}

async function generateText(env:Env,prompt:string){
  try{
    const out:any=await env.AI.run(env.SCRIPT_MODEL||'@cf/qwen/qwen3-30b-a3b-fp8',{messages:[{role:'system',content:'You are DeepCast Studio. Follow source discipline, preserve host identities, do not quote copyrighted song lyrics, and return only the requested output.'},{role:'user',content:prompt}],max_tokens:4096,temperature:0.65});
    const text=String(out?.response||out?.result?.response||out?.choices?.[0]?.message?.content||'').trim(); if(text)return text;
  }catch(e){if(!env.GROQ_API_KEY)throw e;}
  if(!env.GROQ_API_KEY)throw new Error('Workers AI returned no text and Groq fallback is not configured.');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.GROQ_MODEL||'llama-3.3-70b-versatile',messages:[{role:'system',content:'You are DeepCast Studio. Be source-disciplined and do not quote copyrighted song lyrics.'},{role:'user',content:prompt}],temperature:.65})});
  if(!r.ok)throw new Error(`Groq fallback failed (${r.status}).`); const j:any=await r.json(); return String(j.choices?.[0]?.message?.content||'').trim();
}

async function researchWeb(env:Env,topic:string){
  if(!env.GROQ_API_KEY)return '';
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'groq/compound-mini',messages:[{role:'user',content:`Research this DeepCast episode topic using current web results: ${topic}. Return a compact fact brief with source names and URLs. Distinguish verified facts from interpretation. Do not write podcast dialogue and do not quote song lyrics.`}],temperature:.2})});
  if(!r.ok)throw new Error(`Groq web research failed (${r.status}).`);
  const j:any=await r.json();return String(j.choices?.[0]?.message?.content||'').trim();
}

async function dispatchGitHubAudio(env:Env,apiName:'synthesize'|'mix',episodeId:string,part:string|number='final') {
  if(!env.GITHUB_ACTIONS_TOKEN||!env.GITHUB_REPO)throw new Error('GitHub Actions audio runner is not configured.');
  const workflow=env.GITHUB_AUDIO_WORKFLOW||'deepcast-audio.yml';
  const ref=env.GITHUB_AUDIO_REF||'main';
  const endpoint=`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_ACTIONS_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},body:JSON.stringify({ref,inputs:{api_name:apiName,episode_id:episodeId,part:String(part),backend_url:env.PUBLIC_BASE_URL}})});
  if(!r.ok)throw new Error(`GitHub Actions audio dispatch failed (${r.status}): ${(await r.text()).slice(0,400)}`);
}

async function gradioCall(env:Env,apiName:string,payload:any){
  if(!env.KOKORO_SPACE_URL)throw new Error('Hosted Kokoro worker is not configured.');
  const base=env.KOKORO_SPACE_URL.replace(/\/$/,''); const headers:any={'Content-Type':'application/json'}; if(env.HF_TOKEN)headers.Authorization=`Bearer ${env.HF_TOKEN}`;
  const submit=await fetch(`${base}/gradio_api/call/${apiName}`,{method:'POST',headers,body:JSON.stringify({data:[JSON.stringify(payload)]})});
  if(!submit.ok)throw new Error(`Kokoro worker rejected job (${submit.status}).`); const sj:any=await submit.json(); if(!sj.event_id)throw new Error('Kokoro worker returned no event id.');
  const result=await fetch(`${base}/gradio_api/call/${apiName}/${sj.event_id}`,{headers:env.HF_TOKEN?{Authorization:`Bearer ${env.HF_TOKEN}`}:{}}); if(!result.ok)throw new Error(`Kokoro worker result failed (${result.status}).`);
  const text=await result.text(); const blocks=text.split('\n\n'); let final:any=null; for(const block of blocks){const ev=block.match(/^event:\s*(.+)$/m)?.[1];const data=block.match(/^data:\s*(.+)$/m)?.[1];if(ev==='error')throw new Error(data||'Kokoro worker failed.');if(ev==='complete'&&data){try{final=JSON.parse(data)}catch{final=data;}}} return final;
}

async function processJob(job:QueueJob,env:Env){
  const row=await getEpisodeRow(env,job.episodeId); if(!row||row.status==='CANCELLED'||row.status==='COMPLETE'||row.status==='FAILED')return;
  const request=JSON.parse(row.request_json||'{}');
  if(job.kind==='plan'){
    try{
      await setEpisode(env,row.id,'SCRIPTING',10,'Building the episode outline in the background.');
      let researchBrief='';
      if(request.webSearch){
        if(env.GROQ_API_KEY){try{await event(env,row.id,'SCRIPTING','Running one bounded Groq web-research pass for this episode.');researchBrief=await researchWeb(env,`${row.prompt}\n${String(request.producerInstructions||'').slice(0,2000)}`);await env.DB.prepare('UPDATE episodes SET research=?,updated_at=? WHERE id=?').bind(researchBrief,now(),row.id).run();await event(env,row.id,'SCRIPTING','Web research brief saved to this episode.');}catch(e:any){await event(env,row.id,'SCRIPTING',`Web research was unavailable; continuing with provided sources. ${e?.message||''}`.trim());}}
        else await event(env,row.id,'SCRIPTING','Web research was requested but Groq is not configured; continuing with provided sources only.');
      }
      const count=segmentCount(row.runtime); const prompt=`Create a JSON array containing exactly ${count} concise segment focuses for a ${row.format} podcast. Target runtime ${row.runtime} minutes. Topic: ${row.prompt}. Producer instructions: ${request.producerInstructions||'None'}. Source material: ${String(request.sourceMaterial||'').slice(0,16000)}. Current web-research brief: ${researchBrief.slice(0,10000)||'None'}. Return JSON only.`;
      const text=await generateText(env,prompt); let outline:string[]=[]; try{const p=JSON.parse(cleanJson(text)); if(Array.isArray(p))outline=p.map(String).slice(0,count);}catch{} if(outline.length!==count)outline=Array.from({length:count},(_,i)=>`Segment ${i+1}: advance the requested Deep Dive with source-disciplined discussion.`);
      const batch=env.DB.batch(outline.map((focus,i)=>env.DB.prepare('INSERT OR REPLACE INTO episode_segments(episode_id,segment_index,focus,status,updated_at) VALUES(?,?,?,?,?)').bind(row.id,i,focus,'PENDING',now()))); await batch;
      await env.DB.prepare('UPDATE episodes SET expected_segments=?,updated_at=? WHERE id=?').bind(count,now(),row.id).run();
      await event(env,row.id,'SCRIPTING',`Outline created with ${count} segments.`);
      for(let i=0;i<count;i++)await env.EPISODE_QUEUE.send({kind:'script_segment',episodeId:row.id,segmentIndex:i});
    }catch(e:any){await setEpisode(env,row.id,'FAILED',10,'Script planning failed.',{error:e?.message||'Planning failed',failedStage:'plan',retryable:1});}
    return;
  }
  if(job.kind==='script_segment'){
    const i=Number(job.segmentIndex); const seg=await env.DB.prepare('SELECT * FROM episode_segments WHERE episode_id=? AND segment_index=?').bind(row.id,i).first(); if(!seg||seg.script)return;
    try{
      const h1=request.host1||{},h2=request.host2||{}; const prompt=`Write segment ${i+1} of ${row.expected_segments} for a two-host ${row.format} podcast. Focus: ${seg.focus}. Overall topic: ${row.prompt}. Script guidance: ${request.scriptGuidance||'None'}. Guidance mode: ${request.guidanceMode||'guided'}. Source material: ${String(request.sourceMaterial||'').slice(0,14000)}. Current web-research brief: ${String(row.research||'').slice(0,9000)||'None'}. Host 1 ${h1.name||'Jiro'}: ${h1.profile||''}. Host 2 ${h2.name||'Sharpay'}: ${h2.profile||''}. Use only speaker-labelled dialogue lines beginning exactly with ${h1.name||'Jiro'}: or ${h2.name||'Sharpay'}:. Keep speaker identities stable, facts source-disciplined, and do not quote song lyrics. Aim for ${segmentWordTarget(row.runtime)} words so the full episode lands near the requested runtime.`;
      const script=await generateText(env,prompt); if(!script)throw new Error('Empty script segment.'); await env.DB.prepare('UPDATE episode_segments SET script=?,status=?,error=NULL,updated_at=? WHERE episode_id=? AND segment_index=?').bind(script,'SCRIPT_READY',now(),row.id,i).run();
      const ready:any=await env.DB.prepare('SELECT COUNT(*) n FROM episode_segments WHERE episode_id=? AND script IS NOT NULL').bind(row.id).first(); const pct=Math.min(52,15+Math.floor((Number(ready.n)/Number(row.expected_segments))*37)); await env.DB.prepare('UPDATE episodes SET progress=?,progress_message=?,updated_at=? WHERE id=?').bind(pct,`Writing script segments: ${ready.n}/${row.expected_segments} complete.`,now(),row.id).run();
      if(Number(ready.n)===Number(row.expected_segments)){
        const all=(await env.DB.prepare('SELECT script FROM episode_segments WHERE episode_id=? ORDER BY segment_index').bind(row.id).all()).results||[];
        const full=all.map((s:any)=>s.script).join('\n\n');
        const transition:any=await env.DB.prepare(`UPDATE episodes SET status='AUDIO_QUEUED',progress=58,progress_message=?,script=?,engine=?,audio_queued=1,error=NULL,failed_stage=NULL,updated_at=? WHERE id=? AND audio_queued=0 AND status NOT IN ('CANCELLED','COMPLETE')`).bind('Script complete. Audio segments are queued for Kokoro on a background compute runner.',full,'Workers AI / Groq → Kokoro → FFmpeg',now(),row.id).run();
        if(Number(transition?.meta?.changes||0)>0){
          await event(env,row.id,'AUDIO_QUEUED','Script complete. Audio generation moved to the background queue.');
          for(let x=0;x<Number(row.expected_segments);x++)await env.EPISODE_QUEUE.send({kind:'audio_segment',episodeId:row.id,segmentIndex:x});
        }
      }
    }catch(e:any){await env.DB.prepare('UPDATE episode_segments SET status=?,error=?,updated_at=? WHERE episode_id=? AND segment_index=?').bind('FAILED',e?.message||'Script segment failed',now(),row.id,i).run();await setEpisode(env,row.id,'FAILED',25,`Script segment ${i+1} failed.`,{error:e?.message||'Script segment failed',failedStage:`script:${i}`,retryable:1});}
    return;
  }
  if(job.kind==='audio_segment'){
    const i=Number(job.segmentIndex);const seg=await env.DB.prepare('SELECT * FROM episode_segments WHERE episode_id=? AND segment_index=?').bind(row.id,i).first();if(!seg?.script||seg.audio_key)return;
    try{
      await setEpisode(env,row.id,'SYNTHESIZING',Math.max(60,row.progress),`Dispatching audio segment ${i+1} of ${row.expected_segments} to the Kokoro compute runner.`);
      if(env.GITHUB_ACTIONS_TOKEN&&env.GITHUB_REPO) await dispatchGitHubAudio(env,'synthesize',row.id,i);
      else await gradioCall(env,'synthesize',{
        sharedSecret:env.TTS_SHARED_SECRET,episodeId:row.id,segmentIndex:i,script:seg.script,host1:request.host1||{},host2:request.host2||{},audioOutput:request.audioOutput||'Spatial Stereo',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${row.id}/${i}?kind=segment&ext=mp3`
      });
    }catch(e:any){await env.DB.prepare('UPDATE episode_segments SET status=?,error=?,updated_at=? WHERE episode_id=? AND segment_index=?').bind('FAILED',e?.message||'Audio segment failed',now(),row.id,i).run();await setEpisode(env,row.id,'FAILED',Math.max(60,row.progress),`Audio segment ${i+1} failed.`,{error:e?.message||'Audio segment failed',failedStage:`audio:${i}`,retryable:1});}
    return;
  }
  if(job.kind==='mix_episode'){
    try{
      await setEpisode(env,row.id,'MIXING',92,'All voice segments are ready. Dispatching the final FFmpeg mix.');
      if(env.GITHUB_ACTIONS_TOKEN&&env.GITHUB_REPO) await dispatchGitHubAudio(env,'mix',row.id,'final');
      else {
        const segs=(await env.DB.prepare('SELECT segment_index,audio_key FROM episode_segments WHERE episode_id=? ORDER BY segment_index').bind(row.id).all()).results||[];
        const urls=segs.map((s:any)=>`${env.PUBLIC_BASE_URL}/internal/audio-object?key=${encodeURIComponent(s.audio_key)}`);
        const requestedExt=String(request.downloadFormat||'MP3').toLowerCase();const finalExt=['mp3','m4a','wav'].includes(requestedExt)?requestedExt:'mp3';
        await gradioCall(env,'mix',{sharedSecret:env.TTS_SHARED_SECRET,episodeId:row.id,segmentUrls:urls,downloadFormat:finalExt,audioOutput:request.audioOutput||'Spatial Stereo',musicMode:request.musicMode||'none',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${row.id}/final?kind=final&ext=${finalExt}`,downloadToken:env.TTS_SHARED_SECRET});
      }
    }catch(e:any){await setEpisode(env,row.id,'FAILED',92,'Final audio mix failed.',{error:e?.message||'Mix failed',failedStage:'mix',retryable:1});}
  }
}

async function handle(req:Request,env:Env){
  const url=new URL(req.url); const cors=originHeaders(req); if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    if(url.pathname==='/api/health')return reply({ok:true,architecture:'durable episode shell + queue + D1/R2',audioRunner:env.GITHUB_ACTIONS_TOKEN&&env.GITHUB_REPO?'github-actions':env.KOKORO_SPACE_URL?'hosted-gradio':'unconfigured'},200,cors);
    if(url.pathname==='/api/episodes'&&req.method==='POST'){
      const u=await firebaseUser(req,env); const since=new Date(Date.now()-86400000).toISOString();const count:any=await env.DB.prepare('SELECT COUNT(*) n FROM episodes WHERE user_id=? AND created_at>=?').bind(u.uid,since).first();const cap=Math.max(1,Number(env.MAX_DAILY_EPISODES||3));if(Number(count?.n||0)>=cap)return reply({error:`Daily safety cap reached (${cap} episodes). This prevents runaway free-tier usage.`},429,cors);
      const b:any=await req.json();if(!String(b.prompt||'').trim()&&!String(b.scriptGuidance||'').trim())return reply({error:'Prompt or script guidance is required.'},400,cors);const episodeId=id('ep');const created=now();await env.DB.prepare(`INSERT INTO episodes(id,user_id,local_episode_id,title,prompt,project_id,format,runtime,request_json,status,progress,progress_message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(episodeId,u.uid,b.localEpisodeId||null,b.episodeTitle||'Untitled Deep Dive',b.prompt||b.scriptGuidance,b.projectId||null,b.format||'Deep Dive',b.runtime||'45',JSON.stringify(b),'QUEUED',5,'Episode accepted. Waiting for the background script queue.',created,created).run();await event(env,episodeId,'QUEUED','Episode accepted by the background queue.');await env.EPISODE_QUEUE.send({kind:'plan',episodeId});return reply({episode:await episodeJson(env,await getEpisodeRow(env,episodeId))},202,cors);
    }
    const m=url.pathname.match(/^\/api\/episodes\/([^/]+)$/);if(m&&req.method==='GET'){const {row}=await assertOwner(req,env,m[1]);return reply({episode:await episodeJson(env,row)},200,cors);}
    const retry=url.pathname.match(/^\/api\/episodes\/([^/]+)\/retry$/);if(retry&&req.method==='POST'){
      const {row}=await assertOwner(req,env,retry[1]);
      if(row.status!=='FAILED'||!row.retryable)return reply({error:'This episode is not retryable.'},409,cors);
      const stage=String(row.failed_stage||'plan');
      if(stage==='plan'){
        await setEpisode(env,row.id,'QUEUED',5,'Retry accepted. Rebuilding the episode plan in the background.',{error:null,failedStage:null});
        await env.EPISODE_QUEUE.send({kind:'plan',episodeId:row.id});
      }else if(stage.startsWith('script:')){
        await setEpisode(env,row.id,'SCRIPTING',Math.max(12,Math.min(50,row.progress)),'Retry accepted. Resuming only incomplete script segments.',{error:null,failedStage:null});
        const missing=(await env.DB.prepare('SELECT segment_index FROM episode_segments WHERE episode_id=? AND script IS NULL ORDER BY segment_index').bind(row.id).all()).results||[];
        for(const seg of missing)await env.EPISODE_QUEUE.send({kind:'script_segment',episodeId:row.id,segmentIndex:Number((seg as any).segment_index)});
      }else if(stage.startsWith('audio:')){
        await setEpisode(env,row.id,'SYNTHESIZING',Math.max(60,row.progress),'Retry accepted. Resuming only incomplete audio segments.',{error:null,failedStage:null});
        const missing=(await env.DB.prepare('SELECT segment_index FROM episode_segments WHERE episode_id=? AND script IS NOT NULL AND audio_key IS NULL ORDER BY segment_index').bind(row.id).all()).results||[];
        for(const seg of missing)await env.EPISODE_QUEUE.send({kind:'audio_segment',episodeId:row.id,segmentIndex:Number((seg as any).segment_index)});
      }else if(stage==='mix'){
        await setEpisode(env,row.id,'MIXING',92,'Retry accepted. Re-running only the final FFmpeg mix.',{error:null,failedStage:null});
        await env.EPISODE_QUEUE.send({kind:'mix_episode',episodeId:row.id});
      }else return reply({error:'Unknown failed stage.'},409,cors);
      return reply({episode:await episodeJson(env,await getEpisodeRow(env,row.id))},202,cors);
    }
    const cancel=url.pathname.match(/^\/api\/episodes\/([^/]+)\/cancel$/);if(cancel&&req.method==='POST'){const {row}=await assertOwner(req,env,cancel[1]);if(['COMPLETE','CANCELLED'].includes(row.status))return reply({episode:await episodeJson(env,row)},200,cors);await setEpisode(env,row.id,'CANCELLED',row.progress,'Generation cancelled. Existing script/audio segments were preserved.',{retryable:0});return reply({episode:await episodeJson(env,await getEpisodeRow(env,row.id))},200,cors);}
    const audio=url.pathname.match(/^\/api\/episodes\/([^/]+)\/audio$/);if(audio&&req.method==='POST'){const {row}=await assertOwner(req,env,audio[1]);if(row.status!=='SCRIPT_READY')return reply({error:'Audio can only be started from SCRIPT READY.'},409,cors);const transition:any=await env.DB.prepare(`UPDATE episodes SET status='AUDIO_QUEUED',progress=58,progress_message=?,audio_queued=1,updated_at=? WHERE id=? AND audio_queued=0`).bind('Audio generation queued.',now(),row.id).run();if(Number(transition?.meta?.changes||0)>0){await event(env,row.id,'AUDIO_QUEUED','Audio generation queued.');const missing=(await env.DB.prepare('SELECT segment_index FROM episode_segments WHERE episode_id=? AND script IS NOT NULL AND audio_key IS NULL ORDER BY segment_index').bind(row.id).all()).results||[];for(const seg of missing)await env.EPISODE_QUEUE.send({kind:'audio_segment',episodeId:row.id,segmentIndex:Number((seg as any).segment_index)});}return reply({episode:await episodeJson(env,await getEpisodeRow(env,row.id))},202,cors);}
    const asset=url.pathname.match(/^\/public\/assets\/([^/]+)$/);if(asset&&req.method==='GET'){const a=await env.DB.prepare('SELECT * FROM episode_assets WHERE access_token=?').bind(asset[1]).first();if(!a)return new Response('Not found',{status:404});const obj=await env.AUDIO.get(a.r2_key);if(!obj)return new Response('Not found',{status:404});const h=new Headers();h.set('Content-Type',a.kind==='mp3'?'audio/mpeg':a.kind==='m4a'?'audio/mp4':a.kind==='wav'?'audio/wav':'application/octet-stream');h.set('Content-Disposition',`inline; filename="deepcast-${a.episode_id}.${a.kind}"`);h.set('Cache-Control','private, max-age=3600');return new Response(obj.body,{headers:h});}
    const jobPayload=url.pathname.match(/^\/internal\/audio-job\/([^/]+)\/([^/]+)$/);if(jobPayload&&req.method==='GET'){
      if(!env.TTS_SHARED_SECRET||req.headers.get('authorization')!==`Bearer ${env.TTS_SHARED_SECRET}`)return new Response('Forbidden',{status:403});
      const episodeId=jobPayload[1],part=jobPayload[2];const row=await getEpisodeRow(env,episodeId);if(!row)return reply({error:'Episode not found'},404,cors);if(row.status==='CANCELLED')return reply({error:'Episode cancelled'},409,cors);
      const request=JSON.parse(row.request_json||'{}');
      if(part==='final'){
        const segs=(await env.DB.prepare('SELECT segment_index,audio_key FROM episode_segments WHERE episode_id=? AND audio_key IS NOT NULL ORDER BY segment_index').bind(episodeId).all()).results||[];
        const requestedExt=String(request.downloadFormat||'MP3').toLowerCase();const finalExt=['mp3','m4a','wav'].includes(requestedExt)?requestedExt:'mp3';
        return reply({episodeId,segmentUrls:segs.map((s:any)=>`${env.PUBLIC_BASE_URL}/internal/audio-object?key=${encodeURIComponent(s.audio_key)}`),downloadFormat:finalExt,audioOutput:request.audioOutput||'Spatial Stereo',musicMode:request.musicMode||'none',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${episodeId}/final?kind=final&ext=${finalExt}`},200,cors);
      }
      const i=Number(part);const seg=await env.DB.prepare('SELECT * FROM episode_segments WHERE episode_id=? AND segment_index=?').bind(episodeId,i).first();if(!seg?.script)return reply({error:'Script segment not ready'},409,cors);
      return reply({episodeId,segmentIndex:i,script:seg.script,host1:request.host1||{},host2:request.host2||{},audioOutput:request.audioOutput||'Spatial Stereo',callbackUrl:`${env.PUBLIC_BASE_URL}/internal/audio/${episodeId}/${i}?kind=segment&ext=mp3`},200,cors);
    }
    const statusUpdate=url.pathname.match(/^\/internal\/audio-status\/([^/]+)$/);if(statusUpdate&&req.method==='POST'){
      if(!env.TTS_SHARED_SECRET||req.headers.get('authorization')!==`Bearer ${env.TTS_SHARED_SECRET}`)return new Response('Forbidden',{status:403});
      const b:any=await req.json();const row=await getEpisodeRow(env,statusUpdate[1]);if(!row)return reply({error:'Episode not found'},404,cors);if(row.status==='CANCELLED')return reply({ok:false,cancelled:true},409,cors);
      const allowed=new Set(['SYNTHESIZING','MIXING','FAILED']);const status=allowed.has(String(b.status))?String(b.status):'SYNTHESIZING';
      await setEpisode(env,row.id,status,Math.max(0,Math.min(100,Number(b.progress??row.progress))),String(b.message||'Audio worker status update.'),{error:b.error?String(b.error):null,failedStage:b.failedStage?String(b.failedStage):null,retryable:status==='FAILED'?1:1});
      return reply({ok:true},200,cors);
    }
    const upload=url.pathname.match(/^\/internal\/audio\/([^/]+)\/([^/]+)$/);if(upload&&req.method==='PUT'){
      if(!env.TTS_SHARED_SECRET||req.headers.get('authorization')!==`Bearer ${env.TTS_SHARED_SECRET}`)return new Response('Forbidden',{status:403});
      if(!req.body)return new Response('Missing body',{status:400});
      const episodeId=upload[1],part=upload[2],kind=url.searchParams.get('kind')||'segment',ext=(url.searchParams.get('ext')||'mp3').replace(/[^a-z0-9]/g,'');
      const current=await getEpisodeRow(env,episodeId);if(!current||current.status==='CANCELLED')return new Response('Episode unavailable',{status:409});
      const key=`episodes/${episodeId}/${kind==='final'?'final':`segments/${part}`}.${ext}`;
      await env.AUDIO.put(key,req.body,{httpMetadata:{contentType:ext==='mp3'?'audio/mpeg':ext==='m4a'?'audio/mp4':ext==='wav'?'audio/wav':'application/octet-stream'}});
      if(kind==='final'){
        const existing=await env.DB.prepare('SELECT id FROM episode_assets WHERE episode_id=? AND kind=? LIMIT 1').bind(episodeId,ext).first();
        if(!existing){const token=crypto.randomUUID()+crypto.randomUUID();await env.DB.prepare('INSERT INTO episode_assets(id,episode_id,kind,r2_key,label,access_token,created_at) VALUES(?,?,?,?,?,?,?)').bind(id('asset'),episodeId,ext,key,'Finished DeepCast episode',token,now()).run();}
        await setEpisode(env,episodeId,'COMPLETE',100,'Episode generation complete. Audio is ready to play and download.',{engine:'Workers AI / Groq → Kokoro → FFmpeg',retryable:0});
      }else{
        await env.DB.prepare('UPDATE episode_segments SET audio_key=?,status=?,error=NULL,updated_at=? WHERE episode_id=? AND segment_index=?').bind(key,'AUDIO_READY',now(),episodeId,Number(part)).run();
        const row=await getEpisodeRow(env,episodeId);const done:any=await env.DB.prepare('SELECT COUNT(*) n FROM episode_segments WHERE episode_id=? AND audio_key IS NOT NULL').bind(episodeId).first();
        const pct=Math.min(90,60+Math.floor((Number(done.n)/Number(row.expected_segments))*30));await env.DB.prepare('UPDATE episodes SET progress=?,progress_message=?,updated_at=? WHERE id=?').bind(pct,`Audio segments: ${done.n}/${row.expected_segments} complete.`,now(),episodeId).run();
        if(Number(done.n)===Number(row.expected_segments)){
          const transition:any=await env.DB.prepare(`UPDATE episodes SET mix_queued=1,status='MIXING',progress=91,progress_message=?,updated_at=? WHERE id=? AND mix_queued=0 AND status NOT IN ('CANCELLED','COMPLETE')`).bind('All voice segments are ready. Final FFmpeg mix queued.',now(),episodeId).run();
          if(Number(transition?.meta?.changes||0)>0){await event(env,episodeId,'MIXING','All voice segments are ready. Final mix queued.');await env.EPISODE_QUEUE.send({kind:'mix_episode',episodeId});}
        }
      }
      return reply({ok:true,key},200,cors);
    }
    if(url.pathname==='/internal/audio-object'&&req.method==='GET'){if(!env.TTS_SHARED_SECRET||req.headers.get('authorization')!==`Bearer ${env.TTS_SHARED_SECRET}`)return new Response('Forbidden',{status:403});const key=url.searchParams.get('key');if(!key)return new Response('Missing key',{status:400});const obj=await env.AUDIO.get(key);return obj?new Response(obj.body,{headers:{'Content-Type':'audio/mpeg'}}):new Response('Not found',{status:404});}
    if(url.pathname==='/api/preview-voice'&&req.method==='POST'){await firebaseUser(req,env);const b:any=await req.json();if(!env.KOKORO_SPACE_URL)return reply({error:'Hosted Kokoro worker is not configured.'},503,cors);const raw:any=await gradioCall(env,'preview',{sharedSecret:env.TTS_SHARED_SECRET,voice:b.voice||'af_heart',pace:b.pace||'Medium',text:`${b.hostName||'Host'}: Welcome to DeepCast Studio. Let’s build something worth listening to.`});let value:any=Array.isArray(raw)?raw[0]:raw;if(typeof value==='string'){try{value=JSON.parse(value)}catch{}}return reply(value||{error:'Preview worker returned no audio.'},value?.audio?200:502,cors);}
    if(url.pathname==='/api/chat'&&req.method==='POST'){await firebaseUser(req,env);const b:any=await req.json();let text='';if(b.webSearch&&env.GROQ_API_KEY){try{text=await researchWeb(env,`Answer this DeepCast Studio chat question using current web results when useful. Include source names and URLs: ${String(b.message||'').slice(0,12000)}`);}catch{}}if(!text)text=await generateText(env,`Act as DeepCast Studio Chat. User: ${String(b.message||'').slice(0,12000)}`);return reply({text},200,cors);}
    return reply({error:'Not found'},404,cors);
  }catch(e:any){const msg=e?.message||'Request failed';const status=msg==='AUTH_REQUIRED'?401:msg==='FORBIDDEN'?403:msg==='NOT_FOUND'?404:400;return reply({error:msg},status,cors);}
}

export default {
  fetch:handle,
  async queue(batch:any,env:Env){for(const message of batch.messages){try{await processJob(message.body as QueueJob,env);message.ack();}catch(e){console.error('Queue job failed',message.body,e);message.retry();}}}
};
