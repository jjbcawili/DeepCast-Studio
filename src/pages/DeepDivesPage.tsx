import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { getEpisodes } from '../lib/storage';
import { EmptyState } from '../components/EmptyState';
import { TitleArt } from '../components/TitleArt';

export function DeepDivesPage(){
  const episodes=getEpisodes();
  const [q,setQ]=useState('');
  const [view,setView]=useState<'grid'|'list'|'compact'>('grid');
  const filtered=useMemo(()=>episodes.filter(e=>(e.title+' '+e.prompt).toLowerCase().includes(q.toLowerCase())),[episodes,q]);
  return <div className="page"><p className="eyebrow">YOUR AUDIO LIBRARY</p><TitleArt src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dives" fallback="DEEP DIVES" className="page-header-art"/><p>Search, play, download, and revisit every Deep Dive and podcast episode created in your space.</p>
  <section className="section-block accent-block"><p className="eyebrow">CREATE A NEW EPISODE</p><h2>OPEN DEEPCAST STUDIO</h2><p>Choose a project, format, runtime, hosts, sources, music, cover art, and output mix.</p><Link className="primary-button" to="/studio">▶ OPEN STUDIO</Link></section>
  <section className="dashboard-toolbar"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Deep Dives, projects, or prompts…"/><select><option>MOST RECENT</option></select><select><option>ALL</option></select><div className="view-toggle"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}>▦ Grid</button><button className={view==='list'?'active':''} onClick={()=>setView('list')}>☷ List</button><button className={view==='compact'?'active':''} onClick={()=>setView('compact')}>≡ Compact List</button></div></section>
  <section className="section-block"><div className="section-heading"><div><p className="eyebrow">YOUR DEEP DIVES</p><h2>ALL EPISODES</h2><p>Episode history and listening progress are saved on this device for offline viewing.</p></div><b>{filtered.length} OF {episodes.length}</b></div>{filtered.length?<div className={view==='grid'?'card-grid':view==='compact'?'card-list compact':'card-list'}>{filtered.map(e=><article className="content-card" key={e.id}><div className="card-kicker">{e.engine||'SCRIPT READY'}</div><h3>{e.title}</h3><p>{e.format} · {e.runtime} min</p><small>{new Date(e.createdAt).toLocaleString()}</small></article>)}</div>:<EmptyState title="YOUR DEEP DIVE LIBRARY IS READY" action={<Link className="secondary-button" to="/studio">OPEN STUDIO</Link>}>Generate your first episode in Studio. Its script, cover art, and saved audio will appear here.</EmptyState>}</section>
  </div>;
}
