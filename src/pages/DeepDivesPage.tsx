import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { getEpisodes } from '../lib/storage';
import { EmptyState } from '../components/EmptyState';
import { TitleArt } from '../components/TitleArt';

export function DeepDivesPage(){
  const episodes=getEpisodes(); const [q,setQ]=useState(''); const [view,setView]=useState<'grid'|'list'|'compact'>('grid');
  const filtered=useMemo(()=>episodes.filter(e=>(e.title+' '+e.prompt+' '+e.status).toLowerCase().includes(q.toLowerCase())),[episodes,q]);
  return <div className="page"><p className="eyebrow">YOUR AUDIO LIBRARY</p><TitleArt src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dives" fallback="DEEP DIVES" className="page-header-art"/><p>Every Generate Audio click creates an episode immediately. Submitted, processing, failed, cancelled, and completed jobs all keep their own history here.</p>
  <section className="section-block accent-block"><p className="eyebrow">CREATE A NEW EPISODE</p><h2>OPEN DEEPCAST STUDIO</h2><p>Studio stays clean for the next episode. Background progress, retries, errors, and finished audio live inside each episode shell.</p><Link className="primary-button" to="/studio">▶ OPEN STUDIO</Link></section>
  <section className="dashboard-toolbar"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Deep Dives, projects, prompts, or status…"/><select><option>MOST RECENT</option></select><select><option>ALL STATUSES</option></select><div className="view-toggle"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}>▦ Grid</button><button className={view==='list'?'active':''} onClick={()=>setView('list')}>☷ List</button><button className={view==='compact'?'active':''} onClick={()=>setView('compact')}>≡ Compact</button></div></section>
  <section className="section-block"><div className="section-heading"><div><p className="eyebrow">YOUR DEEP DIVES</p><h2>ALL EPISODES</h2></div><b>{filtered.length} OF {episodes.length}</b></div>{filtered.length?<div className={view==='grid'?'card-grid':view==='compact'?'card-list compact':'card-list'}>{filtered.map(e=><Link className="content-card episode-card-link" to={`/deep-dives/${e.id}`} key={e.id}><div className="card-kicker">{e.engine||'BACKGROUND JOB'}</div><div className="card-title-row"><h3>{e.title}</h3><span className={`status-pill ${e.status.toLowerCase()}`}>{e.status.replaceAll('_',' ')}</span></div><p>{e.format} · {e.runtime} min</p><div className="mini-progress"><span style={{width:`${Math.max(2,e.progress||0)}%`}}/></div><small>{e.progressMessage}</small></Link>)}</div>:<EmptyState title="YOUR DEEP DIVE LIBRARY IS READY" action={<Link className="secondary-button" to="/studio">OPEN STUDIO</Link>}>Generate your first episode in Studio. Its job shell appears here immediately.</EmptyState>}</section>
  </div>;
}
