import { Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export function Header() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('deepcast.theme') || 'dark');
  const navigate = useNavigate();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('deepcast.theme', theme);
  }, [theme]);
  const nav = [['Home','/'],['Projects','/projects'],['Studio','/studio'],['Chat','/chat']];
  return <header className="site-header">
    <button className="brand" onClick={() => navigate('/')} aria-label="DeepCast Studio home">
      <img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="DeepCast Studio" />
    </button>
    <nav className="desktop-nav">{nav.map(([label,to]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>
    <div className="header-actions">
      <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light and dark theme">
        {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <button className="icon-button mobile-menu-button" onClick={() => setOpen(!open)} aria-label="Menu">{open?<X/>:<Menu/>}</button>
    </div>
    {open && <><button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close menu"/><nav className="mobile-nav">{nav.map(([label,to]) => <NavLink onClick={() => setOpen(false)} key={to} to={to}>{label}</NavLink>)}</nav></>}
  </header>;
}
