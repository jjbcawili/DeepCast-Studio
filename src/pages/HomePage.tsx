import { Link } from 'react-router-dom';
import { getEpisodes, getProjects } from '../lib/storage';
import { EmptyState } from '../components/EmptyState';
import { TitleArt } from '../components/TitleArt';

export function HomePage() {
  const projects = getProjects();
  const episodes = getEpisodes();
  const sourceCount = projects.reduce((n,p)=>n+p.sources.length,0);
  return <div className="page home-page">
    <section className="hero">
      <p className="eyebrow hero-create">CREATE A</p>
      <TitleArt src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dive" fallback="DEEP DIVE" className="hero-title-art" />
      <p>Generate a high-quality, multi-host audio podcast discussing your favorite entertainment topics, music industry drama, or iconic pop culture moments.</p>
    </section>
    <section className="section-block studio-session-block">
      <div className="section-heading"><div><p className="eyebrow">START YOUR STUDIO SESSION</p></div></div>
      <p>Configure your hosts, sources, and format for entertainment-first episodes covering music industry drama, main pop girlies, pop culture, gay and stan Twitter, and the Khia Asylum girlies.</p>
      <Link className="primary-button" to="/studio">OPEN STUDIO</Link>
    </section>
    <section className="dashboard-toolbar"><input placeholder="Search projects and Deep Dives..."/><select><option>Most Recent</option><option>Oldest</option></select><select><option>All</option><option>Projects</option><option>Deep Dives</option></select></section>
    <div className="two-column">
      <section className="section-block"><div className="section-heading"><h2>PROJECTS</h2><Link to="/projects">VIEW ALL</Link></div>{projects.length ? <div className="card-grid">{projects.slice(0,4).map(p=><article className="content-card" key={p.id}><h3>{p.title}</h3><p>{p.description}</p><small>{p.sources.length} sources</small></article>)}</div> : <EmptyState title="NO PROJECTS YET" action={<Link className="secondary-button" to="/projects">CREATE A PROJECT</Link>}>Create your first project to organize sources and Deep Dives.</EmptyState>}</section>
      <section className="section-block"><div className="section-heading"><h2>RECENT DEEP DIVES</h2><Link to="/deep-dives">VIEW ALL</Link></div>{episodes.length ? <div className="card-grid">{episodes.slice(0,4).map(e=><article className="content-card" key={e.id}><h3>{e.title}</h3><p>{e.format} · {e.runtime} min</p></article>)}</div> : <EmptyState title="NO DEEP DIVES YET" action={<Link className="secondary-button" to="/studio">OPEN STUDIO</Link>}>Generate an episode in Studio and it will appear here automatically.</EmptyState>}</section>
    </div>
    <section className="workspace-summary section-block">
      <TitleArt src="/assets/DeepCast_Workspace_Title_Transparent_4K.webp" alt="Workspace" fallback="WORKSPACE" className="workspace-title-art" />
      <div className="stats-grid">{[['Projects',projects.length],['Deep Dives',episodes.length],['Sources',sourceCount],['Audio Ready',episodes.filter(e=>e.engine).length]].map(([k,v])=><div className="stat-card" key={String(k)}><strong>{v}</strong><span>{k}</span></div>)}</div>
    </section>
  </div>;
}
