import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

function requireAi() {
  if (!ai) throw new Error('GEMINI_API_KEY environment variable is required');
  return ai;
}
function pcmToWav(pcm: Buffer, sampleRate=24000, channels=1, bitsPerSample=16) {
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF',0); header.writeUInt32LE(36 + pcm.length,4); header.write('WAVE',8);
  header.write('fmt ',12); header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(channels,22);
  header.writeUInt32LE(sampleRate,24); header.writeUInt32LE(byteRate,28); header.writeUInt16LE(blockAlign,32); header.writeUInt16LE(bitsPerSample,34);
  header.write('data',36); header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
function cleanJson(text:string){return text.replace(/```json/gi,'').replace(/```/g,'').trim();}
function runtimeSegments(runtime:string){const n=Number(runtime); if(n>=60)return 16;if(n>=45)return 12;if(n>=30)return 8;return 5;}
function sse(res:express.Response,event:string,data:unknown){res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}

async function withRetry<T>(label:string, task:()=>Promise<T>, attempts=3):Promise<T>{
  let last:unknown;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await task();}catch(error){
      last=error;
      if(attempt===attempts)break;
      const delayMs=500*Math.pow(2,attempt-1);
      console.warn(`${label} attempt ${attempt} failed; retrying in ${delayMs}ms.`,error);
      await new Promise(resolve=>setTimeout(resolve,delayMs));
    }
  }
  throw last instanceof Error?last:new Error(`${label} failed`);
}

async function singleVoice(text:string, voiceName:string){
  const client=requireAi();
  return withRetry('Gemini single-speaker TTS',async()=>{
    const response=await client.models.generateContent({model:TTS_MODEL,contents:[{parts:[{text}]}],config:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}});
    const data=response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if(!data) throw new Error('Gemini TTS returned no audio data');
    return pcmToWav(Buffer.from(data,'base64')).toString('base64');
  });
}
async function multiSpeaker(text:string, speaker1:string, voice1:string, speaker2:string, voice2:string){
  const client=requireAi();
  return withRetry('Gemini multi-speaker TTS',async()=>{
    const response=await client.models.generateContent({model:TTS_MODEL,contents:[{parts:[{text}]}],config:{responseModalities:['AUDIO'],speechConfig:{multiSpeakerVoiceConfig:{speakerVoiceConfigs:[{speaker:speaker1,voiceConfig:{prebuiltVoiceConfig:{voiceName:voice1}}},{speaker:speaker2,voiceConfig:{prebuiltVoiceConfig:{voiceName:voice2}}}]}}}});
    const data=response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if(!data) throw new Error('Gemini multi-speaker TTS returned no audio data');
    return pcmToWav(Buffer.from(data,'base64')).toString('base64');
  });
}

async function startServer(){
  const app=express(); app.use(express.json({limit:'50mb'}));
  app.get('/api/health',(_req,res)=>res.json({ok:true,textModel:TEXT_MODEL,ttsModel:TTS_MODEL,engine:'Gemini TTS'}));
  app.get('/api/config',(_req,res)=>res.json({textModel:TEXT_MODEL,ttsModel:TTS_MODEL,voices:30,driveAuthUrl:process.env.DRIVE_AUTH_URL||null,backendUrl:process.env.DEEPCAST_BACKEND_URL||null}));
  app.post('/api/preview-voice',async(req,res)=>{try{const {hostName='Host',voice='Orus',style='Conversational',pace='Medium',accent='Neutral'}=req.body||{};const text=`Speak in a ${style}, ${pace}-paced ${accent} delivery. ${hostName}: Welcome to DeepCast Studio. Let’s turn sources into a focused, natural, genuinely useful deep dive.`;const audio=await singleVoice(text,voice);res.json({audio,mimeType:'audio/wav',model:TTS_MODEL,voice});}catch(e:any){res.status(500).json({error:e.message||'Voice preview failed'});}});
  app.post('/api/chat',async(req,res)=>{try{
    const client=requireAi();
    const {message='',history=[],webSearch=false}=req.body||{};
    const historyText=Array.isArray(history)?history.slice(-10).map((m:any)=>`${m.role}: ${m.text}`).join('\n'):'';
    const prompt=`You are DeepCast Studio Chat, an entertainment research assistant. Be accurate, distinguish verified facts from interpretation, and do not invent sources. When web grounding is enabled, use current search evidence and keep source-backed claims separate from commentary.\nConversation:\n${historyText}\nUser: ${message}`;
    const out=await client.models.generateContent({
      model:TEXT_MODEL,
      contents:prompt,
      ...(webSearch?{config:{tools:[{googleSearch:{}}]}}:{})
    });
    const grounding=out.candidates?.[0]?.groundingMetadata;
    const sources=(grounding?.groundingChunks||[]).flatMap((chunk:any)=>chunk?.web?.uri?[{title:chunk.web.title||chunk.web.uri,url:chunk.web.uri}]:[]);
    res.json({text:out.text||'',sources});
  }catch(e:any){res.status(500).json({error:e.message||'Chat failed'});}});
  app.post('/api/generate-podcast',async(req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    try{
      const client=requireAi(); const b=req.body||{}; const h1=b.host1||{}; const h2=b.host2||{}; const speaker1=String(h1.name||'Jiro'); const speaker2=String(h2.name||'Sharpay'); const segmentsCount=runtimeSegments(String(b.runtime||'45'));
      sse(res,'progress',{message:'Generating podcast outline…'});
      const outlinePrompt=`Create an entertainment-first podcast outline as a JSON array with exactly ${segmentsCount} strings.\nFormat: ${b.format||'Deep Dive'}\nTarget runtime: ${b.runtime||'45'} minutes\nFocus: ${b.prompt||'Pop culture and entertainment'}\nProducer instructions: ${b.producerInstructions||'None'}\nSource material:\n${b.sourceMaterial||'No source material supplied.'}\nDo not include markdown. Return only valid JSON.`;
      const outlineResponse=await client.models.generateContent({model:TEXT_MODEL,contents:outlinePrompt,...(b.webSearch?{config:{tools:[{googleSearch:{}}]}}:{})}); let segments:string[]=[];try{const parsed=JSON.parse(cleanJson(outlineResponse.text||'[]'));if(Array.isArray(parsed))segments=parsed.map(String);}catch{} if(!segments.length)segments=Array.from({length:segmentsCount},(_,i)=>`Segment ${i+1}: Deep dive into the requested topic.`); sse(res,'outline',{segments});
      let prior=''; let fullScript=''; let inferredTitle=String(b.episodeTitle||'').trim();
      for(let i=0;i<segments.length;i++){
        sse(res,'progress',{message:`Writing script for segment ${i+1} of ${segments.length}…`});
        const exactGuidance=b.guidanceMode==='follow'?'Follow the supplied script/transcript guidance closely. Preserve its order and wording where practical while fixing only clarity, speaker labels, and confirmed factual issues.':'Use the supplied script/transcript guidance as a strong creative and structural input, adapting it naturally into the episode.';
        const scriptPrompt=`Write segment ${i+1} of ${segments.length} for a two-host podcast.\nSegment focus: ${segments[i]}\nOverall focus: ${b.prompt||''}\n${exactGuidance}\nScript guidance: ${b.scriptGuidance||'None'}\nAllow verified additions: ${b.allowVerifiedAdditions!==false?'Yes':'No'}\nSources: ${b.sourceMaterial||'None'}\nProducer instructions: ${b.producerInstructions||'None'}\nHost 1 ${speaker1}: ${h1.profile||''}; style=${h1.style||''}; pace=${h1.pace||''}; accent=${h1.accent||''}; director=${h1.directorsNote||''}.\nHost 2 ${speaker2}: ${h2.profile||''}; style=${h2.style||''}; pace=${h2.pace||''}; accent=${h2.accent||''}; director=${h2.directorsNote||''}.\nPrevious context: ${prior||'This is the opening.'}\nUse only speaker-labelled dialogue. Keep facts source-disciplined. Do not quote copyrighted lyrics. Aim for roughly 220-300 words. Format exactly as lines beginning with ${speaker1}: or ${speaker2}:`;
        const sr=await client.models.generateContent({model:TEXT_MODEL,contents:scriptPrompt,...(b.webSearch?{config:{tools:[{googleSearch:{}}]}}:{})}); const script=sr.text||''; prior=script.slice(-500); fullScript+=(fullScript?'\n\n':'')+script; sse(res,'script_chunk',{index:i,script});
        sse(res,'progress',{message:`Synthesizing Gemini TTS audio for segment ${i+1} of ${segments.length}…`});
        try{const direction=`Perform this as a polished entertainment podcast. ${speaker1} should follow this audio profile: ${h1.profile||'organized and warm'}; style ${h1.style||'conversational'}, pace ${h1.pace||'medium'}, accent ${h1.accent||'neutral'}. ${speaker2} should follow this audio profile: ${h2.profile||'expressive and theatrical'}; style ${h2.style||'expressive'}, pace ${h2.pace||'medium'}, accent ${h2.accent||'neutral'}. Keep speaker identities stable.\n\n${script}`; const audio=await multiSpeaker(direction,speaker1,h1.voice||'Orus',speaker2,h2.voice||'Achernar'); sse(res,'audio_chunk',{index:i,audio,transcript:script,engine:TTS_MODEL,mimeType:'audio/wav'});}catch(audioError:any){sse(res,'progress',{message:`Audio failed for segment ${i+1}; script preserved for retry. ${audioError.message||''}`});}
      }
      if(!inferredTitle){try{const tr=await client.models.generateContent({model:TEXT_MODEL,contents:`Give this podcast episode a concise title only, no quotes: ${b.prompt||segments[0]}`});inferredTitle=(tr.text||'DeepCast Episode').trim();}catch{inferredTitle='DeepCast Episode';}}
      sse(res,'done',{message:'Episode generation complete.',title:inferredTitle,script:fullScript,engine:`Gemini TTS · ${TTS_MODEL}`});
    }catch(e:any){sse(res,'error',{message:e.message||'Generation failed'});}finally{res.end();}
  });
  if(process.env.NODE_ENV!=='production'){const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}else{const distPath=path.join(process.cwd(),'dist');app.use(express.static(distPath));app.get('*',(_req,res)=>res.sendFile(path.join(distPath,'index.html')));}
  app.listen(PORT,'0.0.0.0',()=>console.log(`DeepCast Studio running on http://localhost:${PORT}`));
}
startServer();
