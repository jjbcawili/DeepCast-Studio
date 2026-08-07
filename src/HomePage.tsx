import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, FileAudio, Folder, Menu, MoreVertical, Play, PlusCircle, Search, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const PROJECTS = [
  { name: 'Pop Culture Research', sources: 24, dives: 6, updated: 'Updated today', status: 'Active' },
  { name: 'Music Industry Drama', sources: 12, dives: 2, updated: 'Updated yesterday', status: 'Active' },
  { name: 'Awards Season', sources: 45, dives: 12, updated: 'Updated last week', status: 'Draft' },
];
const DIVES = [
  { title: 'The Cultural Reset of Brat Summer', project: 'Pop Culture Research', runtime: '15:24', status: 'Audio Ready' },
  { title: "Chappell Roan's Drag-Pop Ascension", project: 'Music Industry Drama', runtime: '45:10', status: 'Audio Ready' },
  { title: 'Stan Wars on Twitter', project: 'Pop Culture Research', runtime: '—', status: 'Generating' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <header className="site-header"><Link to="/" className="brand-link"><img src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" alt="" className="brand-emblem" /><img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="DeepCast Studio" className="brand-title" /></Link><nav className="desktop-nav"><Link to="/" className="active">Home</Link><Link to="/">Projects</Link><Link to="/studio">Studio</Link><ThemeToggle /></nav><button className="mobile-menu-button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X /> : <Menu />}</button>{mobileMenuOpen && <nav className="mobile-nav"><Link to="/" onClick={() => setMobileMenuOpen(false)}>Home</Link><Link to="/" onClick={() => setMobileMenuOpen(false)}>Projects</Link><Link to="/studio" onClick={() => setMobileMenuOpen(false)}>Studio</Link><ThemeToggle /></nav>}</header>
      <main className="page home-page">
        <section className="hero-section"><p className="hero-kicker">Create a</p><img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dive" className="hero-title-art" /><p>AI-hosted entertainment, music-industry and pop-culture deep dives with Jiro and Sharpay.</p><button className="primary-button hero-button" onClick={() => navigate('/studio')}><Play /> Start your Studio session</button></section>
        <section className="search-strip"><Search /><input placeholder="Search projects and Deep Dives…" /></section>
        <section className="home-section"><div className="home-section-header"><div className="section-art-shell projects-art-shell" aria-label="Projects"><Folder /><span>Projects</span></div><button className="text-button"><PlusCircle /> New Project</button></div><div className="project-grid">{PROJECTS.map(project => <article className="surface-card project-card" key={project.name}><div className="card-heading-row"><h3>{project.name}</h3><MoreVertical /></div><p>{project.sources} sources · {project.dives} Deep Dives</p><div className="card-meta"><span><Clock /> {project.updated}</span><span>{project.status}</span></div></article>)}</div></section>
        <section className="home-section"><div className="home-section-header title-art-only"><img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dives" className="section-title-art" /></div><div className="dive-list">{DIVES.map(dive => <article className="surface-card dive-row" key={dive.title}><div className="round-icon"><FileAudio /></div><div className="dive-copy"><h3>{dive.title}</h3><p>{dive.project}</p></div><span>{dive.runtime}</span><span className="status-pill">{dive.status}</span></article>)}</div></section>
      </main>
    </div>
  );
}
