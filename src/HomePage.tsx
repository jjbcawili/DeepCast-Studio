import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, Search, PlusCircle, MoreVertical, LayoutGrid, List, FileAudio, Folder, ChevronDown, Activity, Clock, Menu, X } from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header / Navigation */}
      <header className="h-20 md:h-24 lg:h-28 border-b border-white/10 px-4 sm:px-8 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-10 transition-all">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center">
            {/* Small screens: Emblem only */}
            <img 
              src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" 
              alt="DeepCast Emblem" 
              className="block sm:hidden w-12 h-12 object-contain transition-all"
            />
            {/* Large screens: Alt Title with Emblem */}
            <img 
              src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" 
              alt="DeepCast Studio" 
              className="hidden sm:block h-14 md:h-16 lg:h-20 object-contain transition-all"
            />
          </div>
          
          <nav className="hidden sm:flex items-center gap-4 sm:gap-8">
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-white hover:text-indigo-400 transition-colors">Home</Link>
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors">Projects</Link>
            <Link to="/studio" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors">Deep Dives</Link>
          </nav>

          <button 
            className="sm:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden absolute top-full left-0 right-0 bg-[#080808] border-b border-white/10 p-4 flex flex-col gap-4">
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-white hover:text-indigo-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Projects</Link>
            <Link to="/studio" className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Deep Dives</Link>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-16">
        
        {/* Exact Replicated Hero */}
        <section className="space-y-8">
          <div className="space-y-4 relative z-10">
            <h1 className="text-6xl sm:text-7xl lg:text-[6rem] font-black tracking-tighter leading-[0.85] uppercase">
              Create A<br/>
              <img 
                src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" 
                alt="Deep Dive" 
                className="block h-28 sm:h-40 lg:h-52 -mt-6 sm:-mt-10 lg:-mt-14 object-contain object-left relative z-10"
              />
            </h1>
            <p className="text-lg text-zinc-400 font-medium leading-tight max-w-lg">
              Generate a high-quality, multi-host audio podcast discussing your favorite entertainment topics, music industry drama, or iconic pop culture moments.
            </p>
          </div>
          
          <button
            onClick={() => navigate('/studio')}
            className="h-14 px-8 bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-colors rounded flex items-center justify-center gap-2 shadow-2xl"
          >
            <Play className="w-5 h-5 fill-current" />
            Open Studio
          </button>
        </section>

        {/* Dashboard Toolbar */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search projects and Deep Dives..." 
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all text-white placeholder:text-zinc-600 font-medium text-sm"
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
            <button className="h-10 px-4 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 whitespace-nowrap">
              Sort: Most Recent <ChevronDown className="w-3 h-3" />
            </button>
            <button className="h-10 px-4 bg-white/5 border border-white/10 rounded text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 whitespace-nowrap">
              Filter: All <ChevronDown className="w-3 h-3" />
            </button>
            <div className="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden shrink-0">
              <button className="h-10 w-10 flex items-center justify-center hover:bg-white/10 text-white transition-colors">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button className="h-10 w-10 flex items-center justify-center hover:bg-white/10 text-zinc-500 transition-colors border-l border-white/10">
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-12">
            
            {/* Projects Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                  <Folder className="w-6 h-6 text-indigo-500" />
                  Projects
                </h2>
                <button className="text-[10px] font-bold tracking-widest uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" /> New Project
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { name: 'Pop Culture Research', sources: 24, dives: 6, updated: 'Updated today', status: 'Active' },
                  { name: 'Music Industry Drama', sources: 12, dives: 2, updated: 'Updated yesterday', status: 'Active' },
                  { name: 'Awards Season 2025', sources: 45, dives: 12, updated: 'Updated last week', status: 'Draft' },
                  { name: 'Iconic Red Carpet Looks', sources: 8, dives: 1, updated: 'Updated 2 weeks ago', status: 'Archived' },
                ].map((proj, i) => (
                  <div key={i} className="p-6 bg-[#141414] border border-white/10 rounded-2xl hover:border-indigo-500/50 transition-colors group cursor-pointer relative">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-bold text-white text-lg leading-tight group-hover:text-indigo-400 transition-colors">{proj.name}</h3>
                      <button className="text-zinc-500 hover:text-white transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium mb-4">{proj.sources} Sources &middot; {proj.dives} Deep Dives</p>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {proj.updated}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 bg-white/5 text-zinc-400 rounded">
                        {proj.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Deep Dives */}
            <section className="space-y-6">
              <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                <FileAudio className="w-6 h-6 text-indigo-500" />
                Recent Deep Dives
              </h2>
              <div className="space-y-2">
                {[
                  { title: 'The Cultural Reset of Brat Summer', project: 'Pop Culture Research', runtime: '15:24', date: 'Oct 12, 2026', status: 'Audio Ready' },
                  { title: 'Chappell Roan\'s Drag-Pop Ascension', project: 'Music Industry Drama', runtime: '45:10', date: 'Oct 10, 2026', status: 'Audio Ready' },
                  { title: 'Stan Wars on Twitter', project: 'Pop Culture Research', runtime: '00:00', date: 'Oct 09, 2026', status: 'Generating' },
                  { title: 'The Demise of 2010s Pop', project: 'Music Industry Drama', runtime: '00:00', date: 'Oct 08, 2026', status: 'Draft' },
                  { title: 'Grammys & Queer Artists', project: 'Awards Season 2025', runtime: '00:00', date: 'Oct 05, 2026', status: 'Failed' },
                ].map((dive, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white/5 border border-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer group">
                    <button className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${dive.status === 'Audio Ready' ? 'bg-indigo-500 hover:bg-indigo-400 text-white' : 'bg-white/10 text-zinc-600'}`}>
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white truncate">{dive.title}</h4>
                      <p className="text-xs text-zinc-500 font-medium truncate">{dive.project}</p>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 sm:ml-auto">
                      <div className="text-right hidden sm:block">
                        <span className="block text-xs font-mono text-zinc-400">{dive.runtime}</span>
                        <span className="block text-[10px] text-zinc-600 font-bold uppercase">{dive.date}</span>
                      </div>
                      <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded whitespace-nowrap ${
                        dive.status === 'Audio Ready' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 
                        dive.status === 'Generating' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        dive.status === 'Failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        'bg-white/10 text-zinc-400 border border-white/10'
                      }`}>
                        {dive.status}
                      </span>
                      <button className="text-zinc-500 hover:text-white transition-colors shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {/* Workspace Section */}
            <section className="bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Activity className="w-32 h-32" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tighter mb-8 relative z-10">Workspace</h2>
              
              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-xs font-bold tracking-widest uppercase text-zinc-500">Projects</span>
                  <span className="text-2xl font-black text-white">6</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-xs font-bold tracking-widest uppercase text-zinc-500">Deep Dives</span>
                  <span className="text-2xl font-black text-white">24</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-xs font-bold tracking-widest uppercase text-zinc-500">Sources</span>
                  <span className="text-2xl font-black text-white">318</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-widest uppercase text-zinc-500">Audio Ready</span>
                  <span className="text-2xl font-black text-indigo-400">18</span>
                </div>
              </div>

              <div className="mt-8 space-y-3 relative z-10">
                <button className="w-full h-12 bg-white/10 hover:bg-white/20 text-white font-bold uppercase text-xs tracking-widest transition-colors rounded flex items-center justify-center gap-2">
                  <PlusCircle className="w-4 h-4" /> Add Sources
                </button>
              </div>
            </section>
          </div>
        </div>

      </main>
    </div>
  );
}
