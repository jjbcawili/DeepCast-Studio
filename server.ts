import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT || 3000);
const BACKEND = (process.env.DEEPCAST_BACKEND_URL || '').replace(/\/$/, '');
const CHATGPT_SIGN_IN_URL = process.env.CHATGPT_SIGN_IN_URL || '';

async function proxy(req: Request, res: Response, targetPath: string) {
  if (!BACKEND) return res.status(503).json({ error: 'DeepCast background backend is not configured.' });
  try {
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    const auth = req.header('authorization'); if (auth) headers.Authorization = auth;
    const response = await fetch(`${BACKEND}${targetPath}`, {
      method: req.method,
      headers,
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const contentType = response.headers.get('content-type') || 'application/json';
    res.status(response.status); res.setHeader('Content-Type', contentType);
    const data = Buffer.from(await response.arrayBuffer());
    res.send(data);
  } catch (e: any) {
    res.status(502).json({ error: e?.message || 'DeepCast backend request failed.' });
  }
}

async function startServer(){
  const app=express();
  app.use(express.json({limit:'50mb'}));
  app.get('/api/health',(_req,res)=>res.json({ok:true,backendConfigured:!!BACKEND,generationArchitecture:'episode-shell + Cloudflare Queue background jobs'}));
  app.get('/api/config',(_req,res)=>res.json({
    backendConfigured:!!BACKEND,
    chatgptSignInSupported:!!CHATGPT_SIGN_IN_URL,
    chatgptSignInUrl:CHATGPT_SIGN_IN_URL ? '/api/auth/chatgpt/start' : null,
    generationArchitecture:'episode-shell + Cloudflare Queues + Workers AI/Groq + Chatterbox/Kokoro on GitHub Actions + D1/R2',
  }));
  app.get('/api/auth/chatgpt/start',(_req,res)=>{
    if(!CHATGPT_SIGN_IN_URL)return res.status(501).json({error:'Sign in with ChatGPT is not enabled by this Sites runtime.'});
    res.redirect(CHATGPT_SIGN_IN_URL);
  });
  app.post('/api/episodes',(req,res)=>proxy(req,res,'/api/episodes'));
  app.get('/api/episodes/:id',(req,res)=>proxy(req,res,`/api/episodes/${encodeURIComponent(req.params.id)}`));
  app.post('/api/episodes/:id/retry',(req,res)=>proxy(req,res,`/api/episodes/${encodeURIComponent(req.params.id)}/retry`));
  app.post('/api/episodes/:id/cancel',(req,res)=>proxy(req,res,`/api/episodes/${encodeURIComponent(req.params.id)}/cancel`));
  app.post('/api/episodes/:id/audio',(req,res)=>proxy(req,res,`/api/episodes/${encodeURIComponent(req.params.id)}/audio`));
  app.post('/api/voice-references',(req,res)=>proxy(req,res,'/api/voice-references'));
  app.post('/api/preview-voice',(req,res)=>proxy(req,res,'/api/preview-voice'));
  app.post('/api/chat',(req,res)=>proxy(req,res,'/api/chat'));

  if(process.env.NODE_ENV!=='production'){
    const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});
    app.use(vite.middlewares);
  }else{
    const distPath=path.join(process.cwd(),'dist');
    app.use(express.static(distPath));
    app.get('*',(_req,res)=>res.sendFile(path.join(distPath,'index.html')));
  }
  app.listen(PORT,'0.0.0.0',()=>console.log(`DeepCast Studio running on http://localhost:${PORT}`));
}
startServer();
