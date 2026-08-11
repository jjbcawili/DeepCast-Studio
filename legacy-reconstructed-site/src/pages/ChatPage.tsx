import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

type Message={role:'user'|'assistant';text:string};
export function ChatPage(){
  const auth=useAuth(); const [messages,setMessages]=useState<Message[]>([]); const [text,setText]=useState(''); const [web,setWeb]=useState(false); const [busy,setBusy]=useState(false);
  async function send(seed?:string){const value=(seed??text).trim();if(!value||busy)return;const next=[...messages,{role:'user' as const,text:value}];setMessages(next);setText('');setBusy(true);try{await auth.ensureIdentity();const d=await api.chat({message:value,history:next.slice(-10),webSearch:web});setMessages([...next,{role:'assistant',text:d.text||'No response.'}]);}catch(e:any){setMessages([...next,{role:'assistant',text:e?.message||'Chat request failed.'}]);}finally{setBusy(false)}}
  const lanes=['Explain the rollout strategy behind a major pop era.','Compare two pop-star album campaigns.','Break down a stan-Twitter debate without losing the facts.'];
  return <div className="page chat-page"><p className="eyebrow">ENTERTAINMENT RESEARCH</p><h1 className="page-title">CHAT</h1><p>Ask about pop culture, the music industry, main pop girlies, and the discourse moving gay and stan Twitter.</p>
    <div className="chat-panel"><div className="chat-intro"><h2>WHAT ARE WE DEEP DIVING TODAY?</h2><p>Start with a question or choose a lane below.</p><div className="chip-row">{lanes.map(x=><button key={x} onClick={()=>send(x)}>{x}</button>)}</div></div>
      <div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><b>{m.role==='user'?'YOU':'DEEPCAST'}</b><p>{m.text}</p></div>)}</div>
      <div className="chat-composer"><label className="toggle"><input type="checkbox" checked={web} onChange={e=>setWeb(e.target.checked)}/> WEB SEARCH</label><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Ask DeepCast…"/><div><button className="ghost-button" onClick={()=>setMessages([])}>CLEAR CHAT</button><button className="primary-button" disabled={busy} onClick={()=>send()}>{busy?'THINKING…':'SEND'}</button></div></div>
    </div>
  </div>;
}
