import React, { useState } from 'react';
import Logo from './Logo';

export const APP_URL = `${process.env.REACT_APP_BACKEND_URL || ''}/api/bifrost/v1/app/`;

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const links = [
    ['How it works', '/#flow'],
    ['Privacy model', '/#zk'],
    ['Fees', '/#fees'],
    ['Docs', '/docs'],
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50" data-testid="top-nav">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="/" aria-label="Cloak Privacy home" className="shrink-0" data-testid="nav-logo">
          <Logo size={30} />
        </a>
        <span className="cc-tag hidden font-mono text-[10px] uppercase tracking-[.22em] text-[#7fb894] lg:inline-block" data-testid="nav-tagline">Alpenglow finality · ZK shielded</span>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map(([label, href]) => (
            <a key={label} href={href} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
              className="rounded-full px-3.5 py-2 text-[13.5px] text-[#8fa695] transition hover:bg-[#a9e7c0]/10 hover:text-[#eef6f0]">
              {label}
            </a>
          ))}
          <a href={APP_URL} data-testid="nav-app-button"
            className="ml-2 inline-flex h-10 items-center rounded-full bg-gradient-to-b from-[#c8f3d8] to-[#a9e7c0] px-5 text-[14px] font-semibold text-[#07130c] transition hover:shadow-[0_10px_28px_-10px_rgba(169,231,192,.55)]">
            Open app
          </a>
        </nav>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="nav-menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#a9e7c0]/20 text-[#eef6f0] md:hidden">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="mx-3 rounded-2xl border border-[#a9e7c0]/14 bg-[#0c120e]/95 p-3 backdrop-blur-xl md:hidden" data-testid="nav-mobile-drawer">
          {links.map(([label, href]) => (
            <a key={label} href={href} onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-[15px] text-[#c9d8cc] transition hover:bg-[#a9e7c0]/8">
              {label}
            </a>
          ))}
          <a href={APP_URL} onClick={() => setOpen(false)} data-testid="nav-app-button-mobile"
            className="mt-2 block rounded-full bg-gradient-to-b from-[#c8f3d8] to-[#a9e7c0] px-4 py-3 text-center text-[15px] font-semibold text-[#07130c]">
            Open app
          </a>
        </div>
      )}
    </header>
  );
}
