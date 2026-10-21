import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, X as XIcon, ChevronDown, BookOpen } from 'lucide-react';
import Logo from '../components/Logo';
import TopNav, { X_URL, XGlyph } from '../components/TopNav';
import { DOC_GROUPS } from './docsContent';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { PRODUCTS, JOURNEY, METHODS, PIPE, CLAIMS, PRICES, QA, TECH } from './landingCopy';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const BF = `${BACKEND}/api/bifrost/v1`;
const APP = `${BACKEND}/api/bifrost/v1/app/`;
const IMG = (n) => `/landing/${n}.webp`;
const LINKS = [['Features', '#features'], ['How it works', '#flow'], ['Real ZK', '#zk'], ['Docs', '/docs'], ['Fees', '#fees'], ['FAQ', '#faq']];

/* ---------------- data ---------------- */
function useLiveStats() {
  const [s, setS] = useState({ leaves: null, nullifiers: null, assets: null, root: null, delta: 0, at: 0, live: false });
  useEffect(() => {
    let dead = false;
    const j = (u) => fetch(u, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const stats = () => {
      if (document.hidden) return;
      j(`${BF}/indexer/v1/stats`)
        .then((d) => !dead && setS((p) => {
          const delta = (p.leaves != null && d.leaves > p.leaves) ? d.leaves - p.leaves : 0;
          if (delta) setTimeout(() => { if (!dead) setS((q) => ({ ...q, delta: 0 })); }, 6000);
          return { ...p, delta, leaves: d.leaves, nullifiers: d.nullifiers, root: d.root, at: Date.now(), live: true };
        }))
        .catch(() => !dead && setS((p) => ({ ...p, live: false })));
    };
    const assets = () => {
      if (document.hidden) return;
      j(`${BF}/indexer/v1/assets`).then((d) => !dead && setS((p) => ({ ...p, assets: (d.assets || []).length }))).catch(() => {});
    };
    stats(); assets();
    const t1 = setInterval(stats, 5000);
    const t2 = setInterval(assets, 60000);
    const vis = () => { if (!document.hidden) { stats(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearInterval(t1); clearInterval(t2); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return s;
}
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());

/* ---------------- primitives ---------------- */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${className}`}>
      {children}
    </div>
  );
}

/* military-stealth kicker chip: ⌜ LABEL ⌟ */
function Kicker({ children, dark = false }) {
  return (
    <div className={`cm-kicker ${dark ? 'dk' : ''}`} data-theme={dark ? 'dark' : 'light'}>
      <i className="cm-corner tl" /><i className="cm-corner br" />
      <span className="cm-dot" />{children}
    </div>
  );
}

function BtnPrimary({ href, children, testid, dark = false, big = true, ext = false, className = '' }) {
  return (
    <a href={href} data-testid={testid} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`cm-btn ${dark ? 'cm-btn-w' : ''} group ${big ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-[14px]'} ${className}`}>
      {children}<ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  );
}

function BtnGhost({ href, children, testid, dark = false, ext = false, className = '' }) {
  return (
    <a href={href} data-testid={testid} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`cm-btn-ghost group ${dark ? 'dk' : ''} ${className}`}>
      {children}
    </a>
  );
}

/* ---------------- etched camo contour field (animated) ---------------- */
function ContourField({ dark = true, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0; let visible = true; let t0 = 0;
    const mouse = { x: -9999, y: -9999 };
    const resize = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const LINES = 32;
    const lines = Array.from({ length: LINES }, (_, i) => ({
      y: (i + 0.5) / LINES, a1: 6 + Math.random() * 14, a2: 4 + Math.random() * 10,
      f1: 1 + Math.random() * 2, f2: 2 + Math.random() * 3, p1: Math.random() * 6.28, p2: Math.random() * 6.28,
      sp: 0.25 + Math.random() * 0.5,
    }));
    const ink = dark ? 'rgba(255,255,255,0.16)' : 'rgba(8,9,12,0.13)';
    const inkSoft = dark ? 'rgba(255,255,255,0.07)' : 'rgba(8,9,12,0.05)';
    function draw(ts) {
      raf = 0; if (!visible) return;
      if (!t0) t0 = ts;
      const t = (ts - t0) / 1000;
      const W = cv.clientWidth; const H = cv.clientHeight;
      ctx.clearRect(0, 0, W, H);
      const step = 9;
      for (let li = 0; li < LINES; li += 1) {
        const L = lines[li];
        ctx.beginPath();
        ctx.strokeStyle = li % 4 === 0 ? ink : inkSoft;
        ctx.lineWidth = li % 4 === 0 ? 1.25 : 1;
        for (let x = -20; x <= W + 20; x += step) {
          const nx = x / W;
          let y = L.y * H
            + L.a1 * Math.sin(nx * 6.28 * L.f1 + t * L.sp + L.p1)
            + L.a2 * Math.sin(nx * 6.28 * L.f2 - t * L.sp * 0.7 + L.p2);
          const dx = x - mouse.x; const dy = y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 32400) { const d = Math.sqrt(d2) || 1; y += (dy / d) * (1 - d / 180) * 34; }
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }, { threshold: 0 });
    io.observe(cv);
    const mm = (e) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const ml = () => { mouse.x = -9999; mouse.y = -9999; };
    window.addEventListener('mousemove', mm, { passive: true });
    document.addEventListener('mouseleave', ml);
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener('mousemove', mm); document.removeEventListener('mouseleave', ml);
      window.removeEventListener('resize', resize);
    };
  }, [dark]);
  return <canvas ref={ref} id={dark ? 'camo-hero-canvas' : undefined} aria-hidden="true"
    className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}

/* ---------------- dot-matrix live counter (canvas) ---------------- */
/* ---------------- animated count-up (gloam-minimal) ---------------- */
function CountUp({ value }) {
  const [disp, setDisp] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (value === null || value === undefined) return undefined;
    const from = prev.current; const to = Number(value); prev.current = to;
    let raf; const t0 = performance.now();
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / 900); const e = 1 - Math.pow(1 - k, 3);
      setDisp(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span data-testid="hero-leaves">{value === null || value === undefined ? '—' : disp.toLocaleString()}</span>;
}

function LiveAgo({ at, live }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const secs = at ? Math.max(0, Math.floor((Date.now() - at) / 1000)) : null;
  return (
    <span className="text-white/45" data-testid="hero-live-ago">
      {live ? `live · synced ${secs}s ago` : (at ? 'reconnecting…' : 'connecting…')}
    </span>
  );
}

/* ---------------- camo radar: square sweep + blips (new signature animation) ---------------- */
function Radar({ size = 380, testid }) {
  const blips = [
    { x: '22%', y: '30%', d: 0 }, { x: '68%', y: '22%', d: 1.4 }, { x: '74%', y: '66%', d: 2.6 },
    { x: '30%', y: '72%', d: 3.8 }, { x: '50%', y: '46%', d: 5.0 },
  ];
  return (
    <div className="cm-radar mx-auto" style={{ width: size, height: size }} data-testid={testid} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <i key={i} className="cm-radar-ring" style={{ inset: `${i * 12.5}%` }} />)}
      <i className="cm-radar-cross-h" /><i className="cm-radar-cross-v" />
      <i className="cm-radar-sweep" />
      {blips.map((b, i) => <i key={`b${i}`} className="cm-radar-blip" style={{ left: b.x, top: b.y, animationDelay: `${b.d}s` }} />)}
      <i className="cm-radar-core" />
    </div>
  );
}

/* ---------------- sections ---------------- */
function Hero({ stats }) {
  return (
    <section id="top" data-cx-theme="dark" className="relative overflow-hidden bg-[#08090c] pb-20 pt-36 text-white sm:pt-44 lg:min-h-[100svh]">
      <img src={IMG('camo-etched')} alt="" aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45 [mask-image:radial-gradient(ellipse_90%_75%_at_50%_38%,#000_30%,transparent_78%)]" />
      <ContourField dark className="opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#08090c]/55 via-transparent to-[#08090c]" aria-hidden="true" />

      <div className="relative z-[1] mx-auto flex max-w-[900px] flex-col items-center px-5 text-center">
        <Reveal><Kicker dark>Live on Solana mainnet · Alpenglow finality</Kicker></Reveal>
        <Reveal delay={60}>
          <h1 className="mt-7 text-[46px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[76px] xl:text-[92px]" data-testid="hero-title">
            Hit send.<br />Leave no trace.
          </h1>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-6 max-w-[560px] font-mono text-[13px] uppercase leading-[1.7] tracking-[.14em] text-white/70 sm:text-[14px]">
            A zero-knowledge vault for Solana that pays, trades and bridges to any chain.
          </p>
        </Reveal>

        <Reveal delay={180} className="mt-10 w-full max-w-[560px]">
          <div className="relative overflow-hidden rounded-none border border-white/15 bg-black/60 text-left backdrop-blur-md" data-testid="hero-live">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 font-mono text-[10.5px] uppercase tracking-[.2em]">
              <span className="flex items-center gap-2 text-white/80"><span className="cx-pulse" />Sealed-pool ledger</span>
              <LiveAgo at={stats.at} live={stats.live} />
            </div>
            <div className="px-5 pb-4 pt-5">
              <div className="text-[60px] font-semibold leading-none tracking-[-0.045em] sm:text-[72px]"><CountUp value={stats.leaves} /></div>
              <div className="mt-3 font-mono text-[11px] uppercase tracking-[.14em] text-white/45">
                notes sealed · {fmt(stats.nullifiers)} spent
              </div>
              <div className="mt-1.5 truncate font-mono text-[11px] tracking-[.05em] text-white/30">
                merkle root {stats.root ? `${stats.root.slice(0, 12)}…${stats.root.slice(-6)}` : '—'}
              </div>
              <div className={`mt-4 h-5 font-mono text-[11.5px] uppercase tracking-[.14em] transition-opacity duration-500 ${stats.delta ? 'text-white opacity-100' : 'opacity-0'}`} data-testid="hero-delta">
                +{stats.delta} just sealed into the crowd
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5">
              <span className="text-[12px] leading-[1.45] text-white/50">Every entry is a commitment.<br />None of them has a name.</span>
              <BtnPrimary href={APP} testid="hero-launch" dark big={false}>Open app</BtnPrimary>
            </div>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <BtnGhost href={`${APP}#private-route`} testid="hero-swap" dark>
              Swap without a wallet <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </BtnGhost>
            <BtnGhost href={X_URL} testid="hero-x" dark ext><XGlyph s={13} /> @trycamocash</BtnGhost>
          </div>
        </Reveal>

        <Reveal delay={300} className="mt-10 w-full">
          <dl className="mx-auto grid max-w-[640px] grid-cols-3 gap-2" data-testid="hero-stats">
            {[['Spent nullifiers', fmt(stats.nullifiers)], ['Shieldable tokens', fmt(stats.assets)], ['Swap to', 'Any chain']].map(([k, v]) => (
              <div key={k} className="rounded-none border border-white/12 bg-[#12141a]/[.04] px-3 py-3 backdrop-blur-sm">
                <dt className="font-mono text-[10px] uppercase tracking-[.14em] text-white/50">{k}</dt>
                <dd className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

/* "What Camo is" — gloam-style trio */
function WhatItIs() {
  const trio = [
    ['The field kit', 'One wallet screen for shielding, paying and swapping — nothing else to learn.', '01'],
    ['The vault', 'A zero-knowledge pool on Solana. Your balance becomes notes only you can read.', '02'],
    ['The escape routes', 'Two private ways out: a routed hop to any chain, or an intent solvers race to fill.', '03'],
  ];
  return (
    <section data-cx-theme="dark" className="border-b border-white/10 bg-[#0b0c10] py-20 lg:py-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">What Camo Cash is</h2>
            <p className="mt-3 max-w-[560px] text-[15px] leading-[1.6] text-white/55">The first Alpenglow ZK shield on Solana — every private move final in ~150&nbsp;ms.</p>
            <span className="font-mono text-[11px] uppercase tracking-[.18em] text-white/45">sec/01 · identity</span>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {trio.map(([t, d, n], i) => (
            <Reveal key={t} delay={i * 60}>
              <div className="cm-card group relative h-full rounded-none border border-white/10 bg-[#12141a] p-6" data-testid={`what-card-${i}`}>
                <span className="font-mono text-[12px] text-white/40">{n}</span>
                <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-white">{t}</h3>
                <p className="mt-2.5 text-[15px] leading-[1.6] text-white/65">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section data-cx-theme="dark" className="relative overflow-hidden border-b border-white/10 bg-[#12141a] py-20 lg:py-28">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 lg:grid-cols-3">
        <Reveal>
          <h2 className="text-[32px] font-medium leading-[1.12] tracking-[-0.02em] text-white sm:text-[40px]">Camo Cash cracks the oldest problem on-chain.</h2>
          <p className="mt-5 font-mono text-[13px] uppercase leading-[1.7] tracking-[.1em] text-white/60">Private money on a public ledger, with every move proven, not just hidden.</p>
        </Reveal>
        <Reveal delay={80}><Radar size={360} testid="statement-radar" /></Reveal>
        <Reveal delay={160} className="lg:text-right">
          <h3 className="text-[26px] font-medium leading-[1.15] text-white sm:text-[30px]">Shield once,</h3>
          <p className="mt-2 text-[17px] leading-[1.5] text-white/70">and every move after that<br className="hidden lg:block" /> happens behind the wall.</p>
          <h3 className="mt-8 text-[26px] font-medium leading-[1.15] text-white sm:text-[30px]">Same wallet, zero hoops,</h3>
          <p className="mt-2 text-[17px] leading-[1.5] text-white/70">your usual flow,<br className="hidden lg:block" /> just off the record.</p>
        </Reveal>
      </div>
    </section>
  );
}

const CARDS = [
  ['icon_browser_key', 'Keys are born in your browser and never leave it.'],
  ['icon_shield_coin', 'One signature seals any SPL token.'],
  ['icon_bolt', 'Relayers pay the gas, so private moves need no pop-ups.'],
  ['icon_route', 'Exit to any chain with no wallet link.'],
  ['icon_vault', 'Fully non-custodial. Only your proof moves your notes.'],
];
function Features() {
  return (
    <section id="features" data-cx-theme="dark" className="bg-[#0b0c10] py-20 lg:py-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[640px] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">Your ledger was an open book. Close it.</h2>
            <span className="font-mono text-[11px] uppercase tracking-[.18em] text-white/45">sec/02 · capabilities</span>
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CARDS.map(([img, t], i) => (
            <Reveal key={img} delay={i * 60}>
              <div className="cm-card group flex h-full min-h-[230px] flex-col rounded-none border border-white/10 bg-[#12141a] p-4" data-testid={`feature-card-${i}`}>
                <img src={IMG(img)} alt="" className="mx-auto h-[120px] w-auto object-contain" draggable="false" />
                <p className="mt-auto pt-5 text-[15px] font-medium leading-[1.3] text-white">{t}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-20">
          <Reveal>
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <h3 className="text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[40px]">Three ways off the radar.</h3>
              <span className="hidden font-mono text-[11px] uppercase tracking-[.18em] text-white/45 sm:block">vault · route · intent</span>
            </div>
          </Reveal>
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.key} delay={i * 60}>
              <a href={p.href} data-testid={`pillar-${p.key}`}
                className="group grid gap-5 border-b border-white/10 py-8 transition-colors duration-300 hover:bg-[#12141a] md:grid-cols-[90px_1.1fr_1.4fr_auto] md:items-start">
                <span className="font-mono text-[40px] font-bold leading-none text-white/15 transition-colors duration-300 group-hover:text-white">0{i + 1}</span>
                <span>
                  <span className="inline-block rounded-none border border-white/25 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[.14em] text-white/70">{p.tag}</span>
                  <span className="mt-3 block text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-[28px]">{p.title}</span>
                </span>
                <span className="block text-[16px] leading-[1.55] text-white/65 md:pt-9">{p.body}</span>
                <span className="cm-btn-ghost inline-flex items-center gap-2 self-center whitespace-nowrap">{p.cta}<ArrowUpRight className="h-4 w-4" /></span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Flow() {
  return (
    <section id="flow" data-cx-theme="dark" className="border-y border-white/10 bg-[#12141a] py-20 lg:py-24">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[1fr_1.35fr]">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <Kicker>The playbook</Kicker>
            <h2 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">Walk in seen. Walk out unseen.</h2>
            <p className="mt-4 max-w-[400px] text-[16px] leading-[1.6] text-white/60">Only the first and last step are public.</p>
          </div>
        </Reveal>
        <ol className="relative space-y-3 border-l-2 border-dashed border-white/25 pl-6">
          {JOURNEY.map((s, i) => (
            <Reveal key={s.t} delay={i * 60}>
              <li className={`relative rounded-none p-5 ${s.tone === 'dark' ? 'bg-white text-[#08090c]' : 'border border-white/10 bg-[#12141a]'}`} data-testid={`flow-step-${i}`}>
                <span className={`absolute -left-[37px] top-5 grid h-6 w-6 place-items-center rounded-none border-2 border-white/40 font-mono text-[11px] font-bold ${s.tone === 'dark' ? 'bg-[#12141a] text-white' : 'bg-[#12141a] text-white'}`}>{i + 1}</span>
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[19px] font-semibold tracking-[-0.01em]">{s.t}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-[.14em] ${s.tone === 'dark' ? 'text-[#08090c]/55' : 'text-white/50'}`}>{s.tone === 'dark' ? 'off the record' : 'on the record'}</span>
                </span>
                <p className={`mt-2 text-[14.5px] leading-[1.6] ${s.tone === 'dark' ? 'text-[#08090c]/65' : 'text-white/65'}`}>{s.d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RealZk() {
  return (
    <section id="zk" data-cx-theme="dark" className="bg-[#0b0c10] py-20 lg:py-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <Kicker>Real zero-knowledge</Kicker>
            <h2 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">Hiding is easy.<br />Proving is the point.</h2>
            <p className="mt-5 max-w-[620px] text-[16px] leading-[1.6] text-white/60">Others blur the trail. Camo Cash proves every move.</p>
          </Reveal>
          <Reveal delay={80}><img src={IMG('icon_proof')} alt="Sealed proof" className="cm-drift mx-auto w-[200px] lg:ml-auto lg:mr-0" draggable="false" /></Reveal>
        </div>

        <div className="mt-12 overflow-hidden rounded-none border border-white/10 bg-[#12141a]">
          {METHODS.map((z, i) => (
            <div key={z.k} className={`grid gap-2 px-5 py-5 sm:grid-cols-[200px_1fr_auto] sm:items-center ${i ? 'border-t border-white/10' : ''} ${z.zk ? 'bg-white text-[#08090c]' : ''}`} data-testid={`zk-system-${i}`}>
              <span className="text-[19px] font-semibold tracking-[-0.01em]">{z.k}</span>
              <span className={`text-[14.5px] leading-[1.5] ${z.zk ? 'text-[#08090c]/75' : 'text-white/65'}`}><b className="font-semibold">{z.line}</b> {z.verdict}</span>
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-none px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.12em] ${z.zk ? 'bg-[#12141a] text-white' : 'border border-white/10 text-white/55'}`}>{z.zk ? <><Check className="h-3.5 w-3.5" />proof</> : <><XIcon className="h-3.5 w-3.5" />no proof</>}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-none border border-white/10 bg-[#12141a] p-6">
              <div className="font-mono text-[11px] uppercase tracking-[.16em] text-white/45">Life of a proof</div>
              <ol className="mt-4 space-y-2" data-testid="zk-pipeline">
                {PIPE.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 font-mono text-[13px] text-white">
                    <span className={`grid h-7 w-7 place-items-center rounded-none text-[12px] ${i === 2 ? 'bg-white text-[#08090c]' : 'border border-white/10'}`}>{i + 1}</span>{s}
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="h-full rounded-none border border-white/10 bg-[#12141a] p-6 text-white">
              <div className="font-mono text-[11px] uppercase tracking-[.16em] text-white/50">What a proof swears to</div>
              <ul className="mt-4 space-y-3">
                {CLAIMS.map((x) => <li key={x} className="flex gap-3 text-[15px] font-medium leading-[1.45]"><Check className="mt-0.5 h-4 w-4 shrink-0" />{x}</li>)}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Tech() {
  return (
    <section id="tech" data-cx-theme="dark" className="border-y border-white/10 bg-[#12141a] py-20 lg:py-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <Kicker>Field manual</Kicker>
            <h2 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">Read the manual.</h2>
            <p className="mt-3 max-w-[560px] text-[16px] leading-[1.6] text-white/60">The full story lives in the docs.</p>
          </Reveal>
          <BtnPrimary href="/docs" testid="docs-open"><BookOpen className="h-4 w-4" />Open the docs</BtnPrimary>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DOC_GROUPS.map((g, i) => (
            <Reveal key={g.id} delay={i * 60}>
              <div className="cm-card flex h-full flex-col rounded-none border border-white/10 bg-[#0b0c10] p-5" data-testid={`docs-group-${g.id}`}>
                <span className="font-mono text-[12px] text-white/40">0{i + 1}</span>
                <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-white">{g.title}</h3>
                <ul className="mt-4 space-y-1.5">
                  {g.pages.map((p) => (
                    <li key={p.id}><a href={`/docs#${p.id}`} className="group inline-flex items-center gap-1.5 text-[14px] text-white/65 hover:text-white">{p.title}<ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></a></li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-14" id="privacy">
            <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[30px]">The tech, in one line each.</h3>
            <div className="mt-5 grid gap-px overflow-hidden rounded-none border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3" data-testid="tech-grid">
              {TECH.map(([k, v]) => (
                <div key={k} className="group bg-[#12141a] p-5 transition-colors duration-300 hover:bg-[#181a22]">
                  <div className="font-mono text-[13px] font-bold text-white transition-colors">{k}</div>
                  <div className="mt-2 text-[14.5px] leading-[1.5] text-white/65 transition-colors group-hover:text-white/85">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Fees() {
  const [open, setOpen] = useState(false);
  return (
    <section id="fees" data-cx-theme="dark" className="bg-[#0b0c10] py-20 lg:py-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal>
          <div className="rounded-none border border-white/10 bg-[#12141a]">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="fees-toggle"
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-7">
              <span>
                <span className="block text-[22px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">Fees</span>
                <span className="mt-1 block text-[14px] text-white/60">Private sends are free. Everything else is shown before you confirm.</span>
              </span>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-none border border-white/40 transition-all duration-300 ${open ? 'rotate-180 bg-white text-[#08090c]' : ''}`}><ChevronDown className="h-5 w-5" /></span>
            </button>
            <div className={`grid transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="overflow-x-auto px-5 pb-6 sm:px-7">
                  <table className="w-full min-w-[560px] text-left text-[14px]" data-testid="fees-table">
                    <thead><tr className="border-b border-white/10 text-white/50">
                      <th className="py-3 pr-4 font-medium">Action</th><th className="py-3 pr-4 font-medium">Protocol fee</th><th className="py-3 font-medium">Network cost</th>
                    </tr></thead>
                    <tbody>{PRICES.map((f) => (
                      <tr key={f[0]} className="border-b border-white/10 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-white">{f[0]}</td>
                        <td className="py-3 pr-4 text-white">{f[1]}</td>
                        <td className="py-3 text-white/60">{f[2]}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" data-cx-theme="dark" className="bg-[#0b0c10] pb-20 lg:pb-24">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <Kicker>Debrief</Kicker>
          <h2 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px]">Fair questions.</h2>
          <p className="mt-4 max-w-[360px] text-[16px] leading-[1.6] text-white/60">Short answers. Long ones are in the docs.</p>
        </Reveal>
        <Accordion type="single" collapsible className="space-y-2">
          {QA.map(([q, a], i) => (
            <AccordionItem key={q} value={`f${i}`} className="rounded-none border border-white/10 bg-[#12141a] px-5 data-[state=open]:bg-white/[.05]" data-testid={`faq-${i}`}>
              <AccordionTrigger className="py-4 text-left text-[15.5px] font-semibold text-white hover:no-underline">{q}</AccordionTrigger>
              <AccordionContent className="pb-4 text-[14.5px] leading-[1.65] text-white/65">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section data-cx-theme="dark" className="relative overflow-hidden bg-[#08090c] text-white">
      <img src={IMG('camo-texture')} alt="" aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_75%)]" />
      <ContourField dark className="opacity-45" />
      <div className="relative z-[1] mx-auto grid max-w-[1180px] items-center gap-8 px-5 py-20 lg:min-h-[88svh] lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1">
          <div className="cm-scan relative mx-auto w-full max-w-[480px]">
            <img src={IMG('eye_closed')} alt="An eye zipped shut" className="w-full" draggable="false" />
            <i className="cm-scanline" aria-hidden="true" />
          </div>
        </Reveal>
        <Reveal delay={80} className="order-1 lg:order-2">
          <Kicker dark>Camo / stealth mode</Kicker>
          <h2 className="mt-6 text-[30px] font-medium leading-[1.12] tracking-[-0.02em] sm:text-[42px]">Being watched shouldn&apos;t be the price of using money.</h2>
          <p className="mt-6 text-[16px] leading-[1.65] text-white/70 sm:text-[19px]">Privacy isn&apos;t hiding. It&apos;s choosing who gets to look.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <BtnPrimary href={APP} testid="cta-launch" dark>Open the app</BtnPrimary>
            <BtnGhost href={X_URL} testid="cta-x" dark ext className="h-12 justify-center"><XGlyph /> Follow @trycamocash</BtnGhost>
          </div>
        </Reveal>
      </div>
      <footer className="relative z-[1] border-t border-white/10" data-testid="landing-footer">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-white/50 sm:flex-row">
          <Logo light size={24} />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {LINKS.map(([l, h]) => <a key={h} href={h} className="hover:text-white">{l}</a>)}
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">X</a>
          </div>
          <span>© {new Date().getFullYear()} Camo Cash</span>
        </div>
      </footer>
    </section>
  );
}

export default function LandingPage() {
  const stats = useLiveStats();
  useEffect(() => { document.title = 'Camo Cash · Hit send. Leave no trace.'; }, []);
  return (
    <div className="cx-landing min-h-screen overflow-x-hidden bg-[#08090c] text-white" data-testid="landing-page">
      <TopNav />
      <main>
        <Hero stats={stats} />
        <WhatItIs />
        <Statement />
        <Features />
        <Flow />
        <RealZk />
        <Tech />
        <Fees />
        <Faq />
        <FinalCta />
      </main>
    </div>
  );
}
