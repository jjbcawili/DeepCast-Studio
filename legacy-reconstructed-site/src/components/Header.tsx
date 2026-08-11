import { LogOut, Menu, Moon, Sun, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthModal } from './AuthModal';

export function Header() {
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('deepcast.theme') || 'dark');
  const navigate = useNavigate();
  const auth = useAuth();
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('deepcast.theme', theme); }, [theme]);
  const nav = [['Home','/'],['Projects','/projects'],['Studio','/studio'],['Chat','/chat']];
  const identity = auth.user?.displayName || auth.user?.email || (auth.user?.isAnonymous ? 'Guest' : '');
  return <>
    <header className="site-header">
      <button className="brand" onClick={() => navigate('/')} aria-label="DeepCast Studio home">
        <img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="DeepCast Studio" />
      </button>
      <nav className="desktop-nav">{nav.map(([label,to]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
      <div className="header-actions">
        {auth.user ? <div className="identity-wrap"><span className="identity-label"><UserRound size={15}/>Hi, {identity}</span><button className="icon-button" onClick={() => auth.signOut()} aria-label="Sign out"><LogOut size={17}/></button></div> : <button className="signin-button" onClick={() => setAuthOpen(true)}>SIGN IN</button>}
        <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light and dark theme">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
        <button className="icon-button mobile-menu-button" onClick={() => setOpen(!open)} aria-label="Menu">{open?<X/>:<Menu/>}</button>
      </div>
      {open && <><button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close menu"/><nav className="mobile-nav">{nav.map(([label,to]) => <NavLink onClick={() => setOpen(false)} key={to} to={to}>{label}</NavLink>)}{!auth.user && <button className="mobile-signin" onClick={() => { setOpen(false); setAuthOpen(true); }}>SIGN IN</button>}</nav></>}
    </header>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)}/>
  </>;
}
