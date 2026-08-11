import { useMemo, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { TitleArt } from '../components/TitleArt';
import { getProjects, makeId, saveProjects } from '../lib/storage';
import type { ProjectRecord } from '../types';

export function ProjectsPage() {
  const [projects,setProjects]=useState(getProjects());
  const [show,setShow]=useState(false);
  const [q,setQ]=useState('');
  const [sort,setSort]=useState<'recent'|'oldest'>('recent');
  const [view,setView]=useState<'grid'|'list'>('grid');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  function create(){ if(!title.trim())return; const now=new Date().toISOString(); const p:ProjectRecord={id:makeId('project'),title:title.trim(),description:description.trim(),sources:[],createdAt:now,updatedAt:now}; const next=[p,...projects]; setProjects(next); saveProjects(next); setTitle('');setDescription('');setShow(false); }
  const filtered=useMemo(()=>projects.filter(p=>(p.title+' '+p.description).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>sort==='recent'?b.updatedAt.localeCompare(a.updatedAt):a.updatedAt.localeCompare(b.updatedAt)),[projects,q,sort]);
  return <div className="page"><p className="eyebrow">PROJECT WORKSPACE</p><TitleArt src="/assets/DeepCast_Projects_Title_Transparent_4K.webp" alt="Projects" fallback="PROJECTS" className="page-header-art"/><p>Build focused projects for pop culture, stan and gay Twitter, and main pop gurlie energy—then carry the right context straight into Studio.</p>
    <section className="dashboard-toolbar"><button className="primary-button" onClick={()=>setShow(true)}>＋ CREATE NEW WORKSPACE</button><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects by name or topic…"/><select value={sort} onChange={e=>setSort(e.target.value as 'recent'|'oldest')}><option value="recent">MOST RECENT</option><option value="oldest">OLDEST</option></select><select><option>ALL</option></select><select value={view} onChange={e=>setView(e.target.value as 'grid'|'list')}><option value="grid">GRID</option><option value="list">LIST</option></select></section>
    <section className="section-block"><div className="section-heading"><div><h2>YOUR PROJECTS</h2><p>Manage and organize your research spaces, grounded source documents, and Deep Dives.</p></div><b>{filtered.length} OF {projects.length}</b></div>
    {filtered.length ? <div className={view==='grid'?'card-grid':'card-list'}>{filtered.map(p=><article className="content-card" key={p.id}><div className="card-kicker">WORKSPACE</div><h3>{p.title}</h3><p>{p.description||'No description yet.'}</p><small>{p.sources.length} sources</small></article>)}</div> : <EmptyState title="NO PROJECTS YET" action={<button className="secondary-button" onClick={()=>setShow(true)}>CREATE YOUR FIRST WORKSPACE</button>}>Create a workspace to organize sources, Deep Dives, Studio sessions, and project Chat.</EmptyState>}
    </section>
    {show&&<div className="modal-backdrop" onClick={()=>setShow(false)}><div className="modal" onClick={e=>e.stopPropagation()}><p className="eyebrow">CREATE A PROJECT</p><h2>NEW WORKSPACE</h2><label>Title<input value={title} onChange={e=>setTitle(e.target.value)} autoFocus/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What should this project know and organize?"/></label><div className="modal-actions"><button className="ghost-button" onClick={()=>setShow(false)}>CANCEL</button><button className="primary-button" onClick={create}>CREATE PROJECT</button></div></div></div>}
  </div>;
}
