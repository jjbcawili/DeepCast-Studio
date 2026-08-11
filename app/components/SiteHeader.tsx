"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/deep-dives", label: "Studio", activePaths: ["/deep-dives", "/studio"] },
  { href: "/chat", label: "Chat" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const isActive = (item: (typeof navItems)[number]) => item.href === "/"
    ? pathname === "/"
    : ("activePaths" in item ? item.activePaths.some((path) => pathname.startsWith(path)) : pathname.startsWith(item.href));

  useEffect(() => {
    const saved = window.localStorage.getItem("deepcast-theme");
    const next = saved === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("deepcast-theme", next);
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-menu-open", menuOpen);
    return () => document.documentElement.classList.remove("mobile-menu-open");
  }, [menuOpen]);

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="DeepCast Studio home">
          <span className="desktop-brand-art" aria-hidden="true"><img src="/assets/02_DeepCast_Studio_Alt_Title_Blue_Transparent_4K.svg" alt="" /></span>
          <span className="mobile-brand-art" aria-hidden="true"><img src="/assets/04_DeepCast_Alt_Emblem_Blue_Transparent_4K.svg" alt="" /></span>
          <span className="sr-only">DeepCast Studio</span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(item) ? "page" : undefined}>{item.label}</Link>)}
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span></button>
        </nav>

        <button className="menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
      </header>

      {menuOpen && (
        <>
          <button className="mobile-menu-scrim" type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />
          <nav id="mobile-navigation" className="mobile-menu dropdown-surface" aria-label="Mobile navigation">
            <button className="mobile-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button>
            {navItems.map((item) => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={isActive(item) ? "page" : undefined}>{item.label}<span aria-hidden="true">→</span></Link>)}
            <button className="mobile-theme-toggle" type="button" onClick={toggleTheme}><span>{theme === "dark" ? "☀" : "☾"}</span> {theme === "dark" ? "LIGHT MODE" : "DARK MODE"}</button>
          </nav>
        </>
      )}
    </>
  );
}
