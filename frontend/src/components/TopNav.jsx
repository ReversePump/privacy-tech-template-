import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Radio, Workflow, Receipt, ShieldCheck, HelpCircle, Ghost } from 'lucide-react';
import Logo from './Logo';

export const X_URL = 'https://x.com/trycamocash';
export const APP_URL = `${process.env.REACT_APP_BACKEND_URL || ''}/api/bifrost/v1/app/`;

export const XGlyph = ({ s = 15 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);

const ITEMS = [
  { l: 'Live now: open the app', h: APP_URL, I: Radio, id: 'live' },
  { l: 'Docs', h: '/docs', I: BookOpen, id: 'docs' },
  { l: 'Join the unit', h: X_URL, I: null, id: 'x', ext: true },
  { l: 'The playbook', h: '/#flow', I: Workflow, id: 'flow' },
  { l: 'Ghost swap', h: `${APP_URL}#private-route`, I: Ghost, id: 'swap' },
  { l: 'Fees', h: '/docs#fees', I: Receipt, id: 'fees' },
  { l: 'Stealth model', h: '/docs#visibility', I: ShieldCheck, id: 'privacy' },
  { l: 'FAQ', h: '/#faq', I: HelpCircle, id: 'faq' },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-[1180px] overflow-hidden rounded-none border border-white/25 bg-[#08090c]/85 text-[#f9f9f9] backdrop-blur-md">
        <div className="flex h-[64px] items-center justify-between gap-3 px-3 sm:px-4">
          <a href="/" data-testid="nav-logo" className="shrink-0"><Logo light /></a>
          <span className="cc-tag hidden font-mono text-[10.5px] uppercase tracking-[.16em] text-white/55 md:inline-block" data-testid="nav-tagline">First Alpenglow ZK shield on Solana</span>
          <div className="flex min-w-0 items-center gap-2">
            <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Camo Cash on X" data-testid="nav-x"
              className="hidden h-10 w-10 place-items-center rounded-none border border-white/25 transition hover:-translate-y-0.5 sm:grid"><XGlyph /></a>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} data-testid="nav-menu"
              className="cx-burger relative grid h-10 w-10 place-items-center rounded-none border border-white/25">
              <span className={`cx-bl ${open ? 'o1' : ''}`} /><span className={`cx-bl ${open ? 'o2' : ''}`} /><span className={`cx-bl ${open ? 'o3' : ''}`} />
            </button>
          </div>
        </div>
        <div className={`grid transition-all duration-500 ease-[cubic-bezier(.2,.9,.25,1)] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <nav className="overflow-hidden" data-testid="nav-drawer" aria-hidden={!open}>
            {ITEMS.map(({ l, h, I, id, ext }, i) => (
              <a key={id} href={h} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} data-testid={`nav-item-${id}`}
                {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                style={{ transitionDelay: open ? `${i * 35}ms` : '0ms' }}
                className={`group flex items-center gap-3 border-t border-white/12 px-4 py-3.5 text-[16px] text-white/85 transition-all duration-300 hover:bg-white hover:text-[#08090c] ${open ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`}>
                <span className="grid h-6 w-6 place-items-center">{I ? <I className="h-[19px] w-[19px]" strokeWidth={1.8} /> : <XGlyph s={17} />}</span>
                <span className="flex-1">{l}</span>
                <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </a>
            ))}
            <div className="border-t border-white/12 p-3">
              <a href={APP_URL} data-testid="nav-launch" className="flex h-12 items-center justify-center gap-2 rounded-none bg-white text-[15px] font-semibold text-[#08090c] transition-transform duration-200 hover:scale-[1.02]">Open app <ArrowRight className="h-4 w-4" /></a>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
