import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { cancelEpisode, Episode, EpisodeSegment, exportUrl, getEpisode, retryEpisode, retrySegment } from './deepcastApi';

const ACTIVE = new Set(['submitted', 'queued', 'scripting', 'rendering_audio', 'mixing']);

function prettyStage(stage: string) {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function EpisodePage() {
  const { episodeId = '' } = useParams();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [segments, setSegments] = useState<EpisodeSegment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!episodeId) return;
    try {
      const payload = await getEpisode(episodeId);
      setEpisode(payload.episode);
      setSegments(payload.segments || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load this episode.');
    }
  };

  useEffect(() => { refresh(); }, [episodeId]);

  useEffect(() => {
    if (!episode || !ACTIVE.has(episode.status)) return;
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [episode?.status, episodeId]);

  const failedSegments = useMemo(() => segments.filter(s => s.status === 'failed'), [segments]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); } finally { setBusy(false); }
  };

  const duplicateToStudio = () => {
    if (!episode) return;
    sessionStorage.setItem('deepcast-duplicate-episode', JSON.stringify({ title: episode.title, prompt: episode.prompt, runtimeMinutes: episode.runtime_minutes, format: episode.format }));
    navigate('/studio');
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand-link"><img src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" alt="" className="brand-emblem" /><img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="DeepCast Studio" className="brand-title" /></Link>
        <nav className="desktop-nav always-show"><Link to="/studio">New Episode</Link><ThemeToggle /></nav>
      </header>

      <main className="page episode-page">
        {error && <div className="status-banner error">{error}</div>}
        {!episode && !error && <div className="loading-center"><Loader2 className="spin" /> Loading episode…</div>}

        {episode && (<>
          <section className="episode-heading"><div><p className="eyebrow">Deep Dive Episode</p><h1>{episode.title}</h1><p>{episode.prompt}</p></div><div className={`status-pill status-${episode.status}`}>{episode.status.replace(/_/g, ' ')}</div></section>
          <section className="surface-card episode-progress-card"><div className="progress-topline"><div><strong>{prettyStage(episode.stage)}</strong><span>{Math.max(0, Math.min(100, Number(episode.progress || 0)))}%</span></div>{ACTIVE.has(episode.status) && <Loader2 className="spin" />}{episode.status === 'ready' && <CheckCircle2 />}{episode.status === 'failed' && <XCircle />}</div><div className="progress-track"><div className="progress-bar" style={{ width: `${episode.progress || 0}%` }} /></div><p className="muted-copy">Submitted {new Date(episode.created_at).toLocaleString()}</p></section>
          {episode.failure_message && <section className="status-banner error"><AlertTriangle /><div><strong>{episode.failure_code || 'Generation failed'}</strong><p>{episode.failure_message}</p></div></section>}
          <section className="episode-actions">{ACTIVE.has(episode.status) && <button disabled={busy} className="secondary-button" onClick={() => run(() => cancelEpisode(episode.id))}>Cancel episode</button>}{(episode.status === 'failed' || episode.status === 'cancelled') && <button disabled={busy} className="primary-button compact" onClick={() => run(() => retryEpisode(episode.id))}><RefreshCw /> Retry failed stage</button>}<button className="secondary-button" onClick={duplicateToStudio}><RotateCcw /> Duplicate settings to Studio</button></section>
          {episode.status === 'ready' && <section className="surface-card exports-card"><h2>Downloads</h2><div className="download-grid">{(['mp3', 'wav', 'm4a'] as const).map(fmt => <a className="download-button" href={exportUrl(episode.id, fmt)} key={fmt}><Download /> {fmt.toUpperCase()}</a>)}</div></section>}
          <section className="surface-card segments-card"><div className="section-heading-row"><div><p className="eyebrow">Episode Console</p><h2>Script & audio segments</h2></div><button className="text-button" onClick={refresh}>Refresh</button></div>{segments.length === 0 ? <p className="muted-copy">The script has not produced segments yet.</p> : <div className="segment-list">{segments.map(segment => <article className="segment-row" key={segment.id}><div className="segment-index">{String(segment.idx + 1).padStart(2, '0')}</div><div className="segment-body"><div className="segment-meta"><strong>{segment.speaker}</strong><span>{segment.status}</span><span>{segment.attempts} attempt{segment.attempts === 1 ? '' : 's'}</span></div><p>{segment.text}</p>{segment.failure_message && <p className="segment-error">{segment.failure_message}</p>}</div>{segment.status === 'failed' && <button disabled={busy} className="secondary-button compact" onClick={() => run(() => retrySegment(episode.id, segment.id))}>Retry</button>}</article>)}</div>}{failedSegments.length > 0 && <p className="muted-copy">Only failed segments need to be retried. Successful segments stay attached to this episode.</p>}</section>
        </>)}
      </main>
    </div>
  );
}
