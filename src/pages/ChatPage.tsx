import { useState } from 'react';

type Source={title:string;url:string};
type Message={role:'user'|'assistant';text:string;sources?:Source[]};

export function ChatPage(){
  const [messages,setMessages]=useState<Message[]>([]);
  const [text,setText]=useState('');
  const [web,setWeb]=useState(false);
  const [busy,setBusy]=useState(false);
  async function send(seed?:string){
    const value=(seed??text).trim(); if(!value||busy)return;
    const next=[...messages,{role:'user' as const,text:value}]; setMessages(next); setText('');setBusy(true);
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:value,history:next.slice(-10),webSearch:web})});
      const d=await r.json();
      setMessages([...next,{role:'assistant',text:d.text||d.error||'No response.',sources:Array.isArray(d.sources)?d.sources:undefined}]);
    }catch{
      setMessages([...next,{role:'assistant',text:'Chat request failed. Check the server and GEMINI_API_KEY.'}]);
    }finally{setBusy(false)}
  }
  const lanes=['Explain the rollout strategy behind a major pop era.','Compare two pop-star album campaigns.','Break down a stan-Twitter debate without losing the facts.'];
  return <div className="page chat-page"><p className="eyebrow">ENTERTAINMENT RESEARCH</p><h1 className="page-title">CHAT</h1><p>Ask about pop culture, the music industry, main pop girlies, and the discourse moving gay and stan Twitter.</p>
    <div className="chat-panel"><div className="chat-intro"><h2>WHAT ARE WE DEEP DIVING TODAY?</h2><p>Start with a question or choose a lane below.</p><div className="chip-row">{lanes.map(x=><button key={x} onClick={()=>send(x)}>{x}</button>)}</div></div>
      <div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><b>{m.role==='user'?'YOU':'DEEPCAST'}</b><p>{m.text}</p>{m.sources?.length?<div className="chat-sources"><small>WEB SOURCES</small>{m.sources.slice(0,8).map((s,j)=><a href={s.url} target="_blank" rel="noreferrer" key={`${s.url}-${j}`}>{s.title}</a>)}</div>:null}</div>)}</div>
      <div className="chat-composer"><label className="toggle"><input type="checkbox" checked={web} onChange={e=>setWeb(e.target.checked)}/> WEB SEARCH</label><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Ask DeepCast…"/><div><button className="ghost-button" onClick={()=>setMessages([])}>CLEAR CHAT</button><button className="primary-button" disabled={busy} onClick={()=>send()}>{busy?'THINKING…':'SEND'}</button></div></div>
    </div>
  </div>;
}
