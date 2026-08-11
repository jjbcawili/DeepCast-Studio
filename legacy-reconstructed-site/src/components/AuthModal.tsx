import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

type Props = { open: boolean; onClose: () => void };

export function AuthModal({ open, onClose }: Props) {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chatgpt, setChatgpt] = useState<{ supported: boolean; url?: string | null }>({ supported: false });

  useEffect(() => {
    if (!open) return;
    api.config().then(c => setChatgpt({ supported: c.chatgptSignInSupported, url: c.chatgptSignInUrl })).catch(() => undefined);
  }, [open]);

  if (!open) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); onClose(); }
    catch (e: any) { setError(e?.message || 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  function signInChatGPT() {
    if (!chatgpt.supported || !chatgpt.url) {
      setError('Sign in with ChatGPT is not enabled by this Site runtime yet. Google, email, and Guest remain available.');
      return;
    }
    window.location.assign(chatgpt.url);
  }

  return <div className="modal-backdrop auth-backdrop" onClick={onClose}>
    <div className="modal auth-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="DeepCast Studio sign in">
      <p className="eyebrow">WELCOME TO DEEPCAST STUDIO</p>
      <h2>SAVE YOUR WORK ACROSS DEVICES</h2>
      <p className="auth-copy">Your projects, sources, episodes, transcripts, cover art, listening progress, and preferences stay connected to your account. Signed-out visitors can still browse the public Site.</p>

      <button className="auth-provider-button chatgpt-auth" onClick={signInChatGPT} disabled={busy}>
        <span className="auth-provider-mark">✦</span> SIGN IN WITH CHATGPT
      </button>
      {!chatgpt.supported && <small className="auth-note">ChatGPT sign-in is enabled only when the Site runtime exposes its supported server-side handoff. If used, OpenAI may share your name, email address, and profile picture after you approve the sign-in.</small>}

      <button className="auth-provider-button" onClick={() => run(auth.signInGoogle)} disabled={busy}>
        <span className="auth-provider-mark">G</span> CONTINUE WITH GOOGLE
      </button>

      <div className="auth-divider"><span>OR</span></div>
      <div className="segmented auth-mode">
        <button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>SIGN IN WITH EMAIL</button>
        <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>CREATE ACCOUNT</button>
      </div>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
      <button className="primary-button auth-submit" disabled={busy || !email || !password} onClick={() => run(() => mode === 'create' ? auth.createAccount(email, password) : auth.signInEmail(email, password))}>{mode === 'create' ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
      {mode === 'signin' && <button className="text-button" disabled={busy || !email} onClick={() => run(async () => { await auth.resetPassword(email); })}>FORGOT PASSWORD?</button>}

      <button className="secondary-button auth-guest" onClick={() => run(auth.continueAsGuest)} disabled={busy}>CONTINUE AS GUEST</button>
      <p className="auth-note">Guest projects are tied to this browser until the guest account is upgraded. Clearing browser data can make guest data inaccessible.</p>
      {error && <div className="inline-error">{error}</div>}
      <button className="ghost-button auth-close" onClick={onClose}>CLOSE</button>
    </div>
  </div>;
}
