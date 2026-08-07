import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileAudio, Loader2, Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { createEpisode } from './deepcastApi';

const TRENDING_TOPICS = [
  "The Cultural Reset of 'Brat Summer'",
  "Chappell Roan's Drag-Pop Ascension",
  'Stan Wars & Chart Manipulation on Twitter',
  'The Demise of the 2010s Main Pop Girl',
  "Gay Twitter's Vocabulary Pipeline to Brands",
];

export default function StudioPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [length, setLength] = useState('45');
  const [format, setFormat] = useState('deep-dive');
  const [host1Profile, setHost1Profile] = useState('');
  const [host2Profile, setHost2Profile] = useState('');
  const [showHostSettings, setShowHostSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const clearStudio = () => {
    setTopic('');
    setSourceMaterial('');
    setCustomPrompt('');
    setLength('45');
    setFormat('deep-dive');
    setHost1Profile('');
    setHost2Profile('');
    setShowHostSettings(false);
    setSubmitError('');
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !sourceMaterial.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = await createEpisode({
        title: topic.trim() || 'Untitled Deep Dive',
        prompt: customPrompt.trim() || topic.trim() || 'Create a deep dive from the selected source material.',
        topic: topic.trim(),
        sourceMaterial,
        runtimeMinutes: Number(length),
        format,
        producerInstructions: customPrompt,
        host1Profile,
        host2Profile,
      });

      clearStudio();
      navigate(payload.href || `/deep-dives/${payload.episodeId}`);
    } catch (error: any) {
      setSubmitError(error?.message || 'Unable to submit this Deep Dive.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand-link" aria-label="DeepCast Studio home">
          <img src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" alt="" className="brand-emblem" />
          <img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="DeepCast Studio" className="brand-title" />
        </Link>
        <nav className="desktop-nav">
          <Link to="/">Home</Link>
          <Link to="/">Projects</Link>
          <Link to="/studio" className="active">Studio</Link>
          <ThemeToggle />
        </nav>
        <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
        {mobileMenuOpen && (
          <nav className="mobile-nav">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>Projects</Link>
            <Link to="/studio" onClick={() => setMobileMenuOpen(false)}>Studio</Link>
            <ThemeToggle />
          </nav>
        )}
      </header>

      <main className="page studio-page">
        <section className="studio-intro">
          <img src="/assets/18_DeepDive_Standalone_Title_Blue_Transparent_4K.svg" alt="Deep Dive" className="studio-title-art" />
          <p>Build the episode here. Once you press Generate Audio, its progress moves into its own Deep Dive episode page and this Studio is immediately ready for the next one.</p>
        </section>

        <section className="studio-grid">
          <div className="surface-card studio-form">
            <label>
              <span>Prompt / Focus</span>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What should Jiro and Sharpay focus on in this episode?" />
            </label>

            <div>
              <span className="field-label">Trending Now</span>
              <div className="chip-row">
                {TRENDING_TOPICS.map(item => <button type="button" className="chip" key={item} onClick={() => setTopic(item)}>{item}</button>)}
              </div>
            </div>

            <label>
              <span>Source Material</span>
              <textarea rows={7} value={sourceMaterial} onChange={e => setSourceMaterial(e.target.value)} placeholder="Paste selected source material, context, notes, or article excerpts here." />
            </label>

            <label>
              <span>Producer Instructions</span>
              <textarea rows={4} value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="Tone, emphasis, questions to explore, sequencing, and anything the hosts should prioritize." />
            </label>

            <div className="two-column-fields">
              <label><span>Runtime</span><select value={length} onChange={e => setLength(e.target.value)}><option value="15">~15 minutes</option><option value="30">~30 minutes</option><option value="45">45–60 minute Deep Dive</option><option value="60">~60 minutes</option></select></label>
              <label><span>Format</span><select value={format} onChange={e => setFormat(e.target.value)}><option value="deep-dive">Deep Dive</option><option value="debate">Debate</option><option value="brief">Brief</option><option value="critique">Critique</option></select></label>
            </div>

            <button type="button" className="text-button" onClick={() => setShowHostSettings(!showHostSettings)}>Host casting & personality {showHostSettings ? '−' : '+'}</button>

            {showHostSettings && (
              <div className="two-column-fields host-fields">
                <label><span>Jiro · Male</span><textarea rows={4} value={host1Profile} onChange={e => setHost1Profile(e.target.value)} placeholder="Warm, witty, organized, source-conscious..." /></label>
                <label><span>Sharpay · Female</span><textarea rows={4} value={host2Profile} onChange={e => setHost2Profile(e.target.value)} placeholder="Expressive, theatrical, funny, sharp but accurate..." /></label>
              </div>
            )}

            {submitError && <div className="status-banner error">{submitError}</div>}

            <button type="button" className="primary-button" onClick={handleGenerate} disabled={isSubmitting || (!topic.trim() && !sourceMaterial.trim())}>
              {isSubmitting ? <Loader2 className="spin" /> : <FileAudio />}
              {isSubmitting ? 'Creating episode…' : 'Generate Audio'}
            </button>
          </div>

          <aside className="surface-card clean-console">
            <p className="eyebrow">Studio Console</p>
            <h2>Clean by design.</h2>
            <p>The Studio no longer carries a previous job's transcript, audio buffers, retry loop, or failure state. Every accepted generation creates its own Deep Dive shell first.</p>
            <div className="console-flow"><span>1 · Episode shell</span><span>2 · Background script</span><span>3 · Kokoro voices</span><span>4 · FFmpeg mix</span><span>5 · R2 exports</span></div>
          </aside>
        </section>
      </main>
    </div>
  );
}
