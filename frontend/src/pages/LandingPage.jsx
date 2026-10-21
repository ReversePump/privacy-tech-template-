import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, X as XIcon, ChevronDown, BookOpen } from 'lucide-react';
import Logo from '../components/Logo';
import NmNav, { X_URL, XGlyph } from '../components/NmNav';
import { DOC_GROUPS } from './docsContent';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { PRODUCTS, JOURNEY, METHODS, PIPE, CLAIMS, PRICES, QA, TECH } from './landingCopy';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const BF = `${BACKEND}/api/bifrost/v1`;
const APP = '/app';
const IMG = (n) => `/landing/${n}.webp`;
const LINKS = [['Features', '#features'], ['How it works', '#flow'], ['Real ZK', '#zk'], ['Docs', '/docs'], ['Fees', '#fees'], ['FAQ', '#faq']];

/* ---------------- data ---------------- */
function useLiveStats() {
  const [s, setS] = useState({ leaves: null, nullifiers: null, assets: null, at: 0, live: false });
  useEffect(() => {
    let dead = false;
    const j = (u) => fetch(u, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    // constant live relay: pool stats every 5s, asset list every 60s (pauses while the tab is hidden)
    const stats = () => {
      if (document.hidden) return;
      j(`${BF}/indexer/v1/stats`)
        .then((d) => !dead && setS((p) => ({ ...p, leaves: d.leaves, nullifiers: d.nullifiers, at: Date.now(), live: true })))
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
      className={`transition-all duration-700 ease-[cubic-bezier(.2,.9,.25,1)] ${on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>
      {children}
    </div>
  );
}

function LimeBtn({ href, children, testid, big = false, className = '' }) {
  return (
    <a href={href} data-testid={testid}
      className={`nm-lime group inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold text-[#202221] ${big ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-[14px]'} ${className}`}>
      {children}<ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  );
}


function Kicker({ children, dark = false }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.16em] ${dark ? 'border-white/20 text-white/70' : 'border-[#202221]/25 text-[#202221]/70'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dark ? 'bg-[#B9C1CC] shadow-[0_0_0_3px_rgba(185,193,204,.25)]' : 'bg-[#2B2F33] shadow-[0_0_0_3px_rgba(43,47,51,.18)]'}`} />{children}
    </div>
  );
}

/* ---------------- dot-matrix live counter (canvas) ---------------- */
function DotCounter({ value, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0; let t0 = 0; let visible = true;
    const W = cv.clientWidth; const H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    // sample text into a dot grid
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d');
    o.fillStyle = '#fff'; o.textBaseline = 'middle'; o.textAlign = 'left';
    o.font = `700 ${Math.round(H * 0.82)}px "Space Mono", monospace`;
    o.fillText(value, 4, H / 2 + 2);
    const data = o.getImageData(0, 0, W, H).data;
    const step = 5; const dots = [];
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const on = data[((y | 0) * W + (x | 0)) * 4 + 3] > 120;
        dots.push({ x, y, on, p: Math.random() * 6.28, s: 0.5 + Math.random() });
      }
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }, { threshold: 0 });
    io.observe(cv);
    function draw(ts) {
      raf = 0; if (!visible) return;
      if (!t0) t0 = ts;
      const t = (ts - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];
        if (d.on) {
          const a = 0.75 + 0.25 * Math.sin(t * 2 + d.p);
          ctx.fillStyle = `rgba(236,239,243,${a})`;
          ctx.beginPath(); ctx.arc(d.x, d.y, 1.85, 0, 6.283); ctx.fill();
        } else {
          const a = 0.06 + 0.1 * Math.max(0, Math.sin(t * d.s + d.p + d.x * 0.02));
          ctx.fillStyle = `rgba(217,217,217,${a})`;
          ctx.fillRect(d.x - 0.8, d.y - 0.8, 1.6, 1.6);
        }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [value]);
  return <canvas ref={ref} aria-label={`${label}: ${value}`} className="block h-[74px] w-full" />;
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

/* ---------------- sections ---------------- */
function Hero({ stats }) {
  return (
    <section id="top" data-nm-theme="light" className="relative overflow-hidden bg-[#D9D9D9] pb-16 pt-32 sm:pt-36 lg:min-h-[100svh]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-[1]">
          <Reveal><Kicker>Live on Solana mainnet</Kicker></Reveal>
          <Reveal delay={60}>
            <h1 className="nm-h mt-6 text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#202221] sm:text-[72px] xl:text-[84px]" data-testid="hero-title">
              Hit send.<br /><span className="sm:whitespace-nowrap">Leave no trace.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-6 max-w-[560px] text-[17px] uppercase leading-[1.45] tracking-[.02em] text-[#202221]/85 sm:text-[22px]">
              A zero-knowledge vault for Solana that pays, trades and bridges to any chain.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="nm-live mt-8 w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#202221] bg-[#202221] text-[#D9D9D9]" data-testid="hero-live">
              <div className="flex items-center justify-between px-4 pt-3 font-mono text-[11px] uppercase tracking-[.18em]">
                <span className="flex items-center gap-2 text-[#B9C1CC]"><span className="nm-pulse" />Sealed notes in the pool</span>
                <LiveAgo at={stats.at} live={stats.live} />
              </div>
              <div className="px-3"><DotCounter value={fmt(stats.leaves)} label="Sealed notes" /></div>
              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <span className="text-[12px] leading-[1.4] text-white/55">Every dot is a commitment.<br />None of them has a name.</span>
                <LimeBtn href={APP} testid="hero-launch">Open app</LimeBtn>
              </div>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a href="/app#private-route" data-testid="hero-swap"
                className="group inline-flex items-center gap-2 rounded-[10px] border border-[#202221] px-3.5 py-2 text-[14px] font-medium text-[#202221] transition hover:bg-[#202221] hover:text-[#B9C1CC]">
                Swap without a wallet <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
              <a href={X_URL} target="_blank" rel="noopener noreferrer" data-testid="hero-x"
                className="inline-flex items-center gap-2 rounded-[10px] border border-[#202221]/40 px-3.5 py-2 text-[14px] text-[#202221]/80 transition hover:border-[#202221]"><XGlyph s={13} /> @usenullcash</a>
            </div>
          </Reveal>

          <dl className="mt-8 grid max-w-[520px] grid-cols-3 gap-2" data-testid="hero-stats">
            {[['Spent nullifiers', fmt(stats.nullifiers)], ['Shieldable tokens', fmt(stats.assets)], ['Swap to', 'Any chain']].map(([k, v]) => (
              <div key={k} className="rounded-[10px] border border-[#202221]/25 px-3 py-2.5">
                <dt className="text-[11px] uppercase tracking-[.08em] text-[#202221]/55">{k}</dt>
                <dd className="nm-h mt-1 text-[20px] font-semibold text-[#202221]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="nm-dots pointer-events-none absolute left-[2%] top-[8%] h-[62%] w-[62%] rounded-full" aria-hidden="true" />
          <img src={IMG('hero_vault')} alt="NullCash shielding machine: coins drop into a sealed ring and vanish" className="nm-float relative mx-auto w-full max-w-[600px]" draggable="false" />
        </div>
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section data-nm-theme="light" className="relative overflow-hidden bg-[#D9D9D9] py-20 lg:py-28">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 lg:grid-cols-3">
        <Reveal>
          <h2 className="nm-h text-[32px] font-medium leading-[1.12] tracking-[-0.02em] text-[#202221] sm:text-[40px]">NullCash cracks the oldest problem on-chain.</h2>
          <p className="mt-5 text-[17px] uppercase leading-[1.5] text-[#202221]/80">Private money on a public ledger, with every move proven, not just hidden.</p>
        </Reveal>
        <Reveal delay={80}><img src={IMG('ring_portal')} alt="Coins and records falling into the NullCash ring" className="nm-float-slow mx-auto w-full max-w-[380px]" draggable="false" /></Reveal>
        <Reveal delay={160} className="lg:text-right">
          <h3 className="nm-h text-[26px] font-medium leading-[1.15] text-[#202221] sm:text-[30px]">Shield once,</h3>
          <p className="mt-2 text-[19px] leading-[1.45] text-[#202221]/80">and every move after that<br className="hidden lg:block" /> happens behind the wall.</p>
          <h3 className="nm-h mt-8 text-[26px] font-medium leading-[1.15] text-[#202221] sm:text-[30px]">Same wallet, zero hoops,</h3>
          <p className="mt-2 text-[19px] leading-[1.45] text-[#202221]/80">your usual flow,<br className="hidden lg:block" /> just off the record.</p>
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
    <section id="features" data-nm-theme="dark" className="bg-[#202221] py-24 text-[#D9D9D9] lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal>
          <h2 className="nm-h text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[68px]">Your ledger was an open book.</h2>
          <p className="nm-h mt-1 text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#B9C1CC] sm:text-[68px]"><span className="nm-chev">&gt;&gt;&gt;</span> Close it.</p>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CARDS.map(([img, t], i) => (
            <Reveal key={img} delay={i * 60}>
              <div className="nm-card group flex h-full min-h-[250px] flex-col rounded-[10px] bg-[#D9D9D9] p-4 text-[#202221]" data-testid={`feature-card-${i}`}>
                <img src={IMG(img)} alt="" className="mx-auto h-[130px] w-auto object-contain transition-transform duration-500 group-hover:-translate-y-1.5" draggable="false" />
                <p className="mt-auto pt-6 text-[16px] font-medium leading-[1.2]">{t}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-24">
          <Reveal>
            <div className="flex items-end justify-between gap-4 border-b border-[#D9D9D9]/25 pb-5">
              <h3 className="nm-h text-[30px] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[44px]">Three doors out of the spotlight.</h3>
              <span className="hidden font-mono text-[12px] uppercase tracking-[.16em] text-[#D9D9D9]/45 sm:block">vault · route · intent</span>
            </div>
          </Reveal>
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.key} delay={i * 60}>
              <a href={p.href} data-testid={`pillar-${p.key}`}
                className="nm-row group grid gap-5 border-b border-[#D9D9D9]/25 py-8 md:grid-cols-[90px_1.1fr_1.4fr_auto] md:items-start">
                <span className="font-mono text-[44px] font-bold leading-none text-[#D9D9D9]/25 transition-colors duration-300 group-hover:text-[#B9C1CC]">0{i + 1}</span>
                <span>
                  <span className="inline-block rounded-[6px] border border-[#B9C1CC]/70 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[.14em] text-[#B9C1CC]">{p.tag}</span>
                  <span className="nm-h mt-3 block text-[26px] font-semibold leading-[1.1] text-white sm:text-[30px]">{p.title}</span>
                </span>
                <span>
                  <span className="block text-[17px] leading-[1.5] text-[#D9D9D9]/75 md:pt-9">{p.body}</span>
                </span>
                <span className="inline-flex items-center gap-2 self-center whitespace-nowrap rounded-[10px] border border-[#D9D9D9]/40 px-4 py-2.5 text-[14px] font-semibold transition-all duration-300 group-hover:border-[#B9C1CC] group-hover:bg-[#B9C1CC] group-hover:text-[#202221]">{p.cta}<ArrowUpRight className="h-4 w-4" /></span>
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
    <section id="flow" data-nm-theme="light" className="bg-[#D9D9D9] py-24 lg:py-28">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[1fr_1.35fr]">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <Kicker>How it works</Kicker>
            <h2 className="nm-h mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#202221] sm:text-[54px]">Walk in seen. Walk out unseen.</h2>
            <p className="mt-4 max-w-[400px] text-[16px] leading-[1.6] text-[#202221]/70">Only the first and last step are public.</p>
          </div>
        </Reveal>
        <ol className="relative space-y-3 border-l-2 border-dashed border-[#202221]/35 pl-6">
          {JOURNEY.map((s, i) => (
            <Reveal key={s.t} delay={i * 60}>
              <li className={`relative rounded-[12px] p-5 ${s.tone === 'dark' ? 'bg-[#202221] text-[#D9D9D9]' : 'border border-[#202221]/60'}`} data-testid={`flow-step-${i}`}>
                <span className={`absolute -left-[37px] top-5 grid h-6 w-6 place-items-center rounded-full border-2 border-[#202221] text-[11px] font-bold ${s.tone === 'dark' ? 'bg-[#B9C1CC] text-[#202221]' : 'bg-[#D9D9D9] text-[#202221]'}`}>{i + 1}</span>
                <span className="flex items-center justify-between gap-3">
                  <span className={`nm-h text-[21px] font-semibold ${s.tone === 'dark' ? 'text-white' : 'text-[#202221]'}`}>{s.t}</span>
                  <span className={`font-mono text-[10.5px] uppercase tracking-[.14em] ${s.tone === 'dark' ? 'text-[#B9C1CC]' : 'text-[#202221]/55'}`}>{s.tone === 'dark' ? 'off the record' : 'on the record'}</span>
                </span>
                <p className={`mt-2 text-[15px] leading-[1.6] ${s.tone === 'dark' ? 'text-[#D9D9D9]/75' : 'text-[#202221]/75'}`}>{s.d}</p>
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
    <section id="zk" data-nm-theme="dark" className="bg-[#202221] py-24 text-[#D9D9D9] lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5">
        <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <Kicker dark>Real zero-knowledge</Kicker>
            <h2 className="nm-h mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">Hiding is easy.<br /><span className="text-[#B9C1CC]">Proving is the point.</span></h2>
            <p className="mt-5 max-w-[620px] text-[17px] leading-[1.6] text-[#D9D9D9]/70">Others blur the trail. NullCash proves every move.</p>
          </Reveal>
          <Reveal delay={80}><img src={IMG('icon_proof')} alt="Sealed proof" className="nm-float-slow mx-auto w-[220px] lg:ml-auto lg:mr-0" draggable="false" /></Reveal>
        </div>

        <div className="mt-12 overflow-hidden rounded-[12px] border border-[#D9D9D9]/20">
          {METHODS.map((z, i) => (
            <div key={z.k} className={`grid gap-2 px-5 py-5 sm:grid-cols-[200px_1fr_auto] sm:items-center ${i ? 'border-t border-[#D9D9D9]/15' : ''} ${z.zk ? 'bg-[#B9C1CC] text-[#202221]' : ''}`} data-testid={`zk-system-${i}`}>
              <span className="nm-h text-[20px] font-semibold">{z.k}</span>
              <span className={`text-[15px] leading-[1.5] ${z.zk ? 'text-[#202221]/85' : 'text-[#D9D9D9]/75'}`}><b className="font-semibold">{z.line}</b> {z.verdict}</span>
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-[8px] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.12em] ${z.zk ? 'bg-[#202221] text-[#B9C1CC]' : 'border border-[#D9D9D9]/25 text-[#D9D9D9]/60'}`}>{z.zk ? <><Check className="h-3.5 w-3.5" />proof</> : <><XIcon className="h-3.5 w-3.5" />no proof</>}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[12px] border border-[#D9D9D9]/20 p-6">
              <div className="font-mono text-[11px] uppercase tracking-[.16em] text-[#D9D9D9]/50">Life of a proof</div>
              <ol className="mt-4 space-y-2" data-testid="zk-pipeline">
                {PIPE.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 font-mono text-[13.5px]">
                    <span className={`grid h-7 w-7 place-items-center rounded-[7px] text-[12px] ${i === 2 ? 'bg-[#B9C1CC] text-[#202221]' : 'border border-[#D9D9D9]/30'}`}>{i + 1}</span>{s}
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="h-full rounded-[12px] bg-[#D9D9D9] p-6 text-[#202221]">
              <div className="font-mono text-[11px] uppercase tracking-[.16em] text-[#202221]/55">What a proof swears to</div>
              <ul className="mt-4 space-y-3">
                {CLAIMS.map((x) => <li key={x} className="flex gap-3 text-[15.5px] font-medium leading-[1.45]"><Check className="mt-0.5 h-4 w-4 shrink-0" />{x}</li>)}
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
    <section id="tech" data-nm-theme="light" className="bg-[#D9D9D9] py-24 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <Kicker>Docs</Kicker>
            <h2 className="nm-h mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#202221] sm:text-[56px]">Read the manual.</h2>
            <p className="mt-3 max-w-[560px] text-[16.5px] leading-[1.6] text-[#202221]/75">The full story lives in the docs.</p>
          </Reveal>
          <a href="/docs" data-testid="docs-open" className="nm-lime inline-flex h-12 items-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold text-[#202221]"><BookOpen className="h-4 w-4" />Open the docs</a>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DOC_GROUPS.map((g, i) => (
            <Reveal key={g.id} delay={i * 60}>
              <div className="flex h-full flex-col rounded-[12px] border border-[#202221]/70 p-5" data-testid={`docs-group-${g.id}`}>
                <span className="font-mono text-[12px] text-[#202221]/50">0{i + 1}</span>
                <h3 className="nm-h mt-2 text-[20px] font-semibold text-[#202221]">{g.title}</h3>
                <ul className="mt-4 space-y-1.5">
                  {g.pages.map((p) => (
                    <li key={p.id}><a href={`/docs#${p.id}`} className="group inline-flex items-center gap-1.5 text-[14.5px] text-[#202221]/75 hover:text-[#202221]">{p.title}<ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></a></li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-14" id="privacy">
            <h3 className="nm-h text-[26px] font-semibold text-[#202221] sm:text-[32px]">The tech, in one line each.</h3>
            <div className="mt-5 grid gap-px overflow-hidden rounded-[12px] border border-[#202221]/70 bg-[#202221]/70 sm:grid-cols-2 lg:grid-cols-3" data-testid="tech-grid">
              {TECH.map(([k, v]) => (
                <div key={k} className="group bg-[#D9D9D9] p-5 transition-colors duration-300 hover:bg-[#202221]">
                  <div className="font-mono text-[13px] font-bold text-[#202221] transition-colors group-hover:text-[#B9C1CC]">{k}</div>
                  <div className="mt-2 text-[15px] leading-[1.45] text-[#202221]/75 transition-colors group-hover:text-[#D9D9D9]">{v}</div>
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
    <section id="fees" data-nm-theme="light" className="bg-[#D9D9D9] pb-24">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal>
          <div className="rounded-[14px] border border-[#202221]/70">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="fees-toggle"
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-7">
              <span>
                <span className="nm-h block text-[24px] font-semibold text-[#202221] sm:text-[30px]">Fees</span>
                <span className="mt-1 block text-[14.5px] text-[#202221]/70">Private sends are free. Everything else is shown before you confirm.</span>
              </span>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[#202221] transition-transform duration-300 ${open ? 'rotate-180 bg-[#202221] text-[#B9C1CC]' : ''}`}><ChevronDown className="h-5 w-5" /></span>
            </button>
            <div className={`grid transition-all duration-500 ease-[cubic-bezier(.2,.9,.25,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="overflow-x-auto px-5 pb-6 sm:px-7">
                  <table className="w-full min-w-[560px] text-left text-[14.5px]" data-testid="fees-table">
                    <thead><tr className="border-b border-[#202221]/30 text-[#202221]/60">
                      <th className="py-3 pr-4 font-medium">Action</th><th className="py-3 pr-4 font-medium">Protocol fee</th><th className="py-3 font-medium">Network cost</th>
                    </tr></thead>
                    <tbody>{PRICES.map((f) => (
                      <tr key={f[0]} className="border-b border-[#202221]/12 last:border-0">
                        <td className="py-3 pr-4 font-semibold text-[#202221]">{f[0]}</td>
                        <td className="py-3 pr-4 text-[#202221]">{f[1]}</td>
                        <td className="py-3 text-[#202221]/70">{f[2]}</td>
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
    <section id="faq" data-nm-theme="light" className="bg-[#D9D9D9] pb-24">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <Kicker>FAQ</Kicker>
          <h2 className="nm-h mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#202221] sm:text-[52px]">Fair questions.</h2>
          <p className="mt-4 max-w-[360px] text-[16px] leading-[1.6] text-[#202221]/70">Short answers. Long ones are in the docs.</p>
        </Reveal>
        <Accordion type="single" collapsible className="space-y-2">
          {QA.map(([q, a], i) => (
            <AccordionItem key={q} value={`f${i}`} className="rounded-[12px] border border-[#202221]/60 px-5 data-[state=open]:bg-[#e4e4e4]" data-testid={`faq-${i}`}>
              <AccordionTrigger className="py-4 text-left text-[16px] font-semibold text-[#202221] hover:no-underline">{q}</AccordionTrigger>
              <AccordionContent className="pb-4 text-[15px] leading-[1.65] text-[#202221]/75">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section data-nm-theme="dark" className="overflow-hidden bg-[#202221] text-[#D9D9D9]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-8 px-5 py-20 lg:min-h-[90svh] lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1"><img src={IMG('eye_closed')} alt="An eye zipped shut" className="nm-float-slow mx-auto w-full max-w-[520px]" draggable="false" /></Reveal>
        <Reveal delay={80} className="order-1 lg:order-2">
          <h2 className="nm-h text-[30px] font-medium leading-[1.12] tracking-[-0.02em] text-white sm:text-[42px]">Being watched shouldn&apos;t be the price of using money.</h2>
          <p className="mt-6 text-[17px] leading-[1.65] text-[#D9D9D9]/75 sm:text-[20px]">Privacy isn&apos;t hiding. It&apos;s choosing who gets to look.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a href={APP} data-testid="cta-launch" className="nm-lime flex h-12 items-center justify-center gap-2 rounded-[10px] text-[16px] font-semibold text-[#202221]">Open the app <ArrowRight className="h-4 w-4" /></a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer" data-testid="cta-x"
              className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[#D9D9D9] text-[16px] transition-all duration-300 hover:border-[#B9C1CC] hover:bg-[#B9C1CC] hover:text-[#202221]"><XGlyph /> Follow @usenullcash</a>
          </div>
        </Reveal>
      </div>
      <footer className="border-t border-white/10" data-testid="landing-footer">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-[#D9D9D9]/55 sm:flex-row">
          <Logo light size={24} />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {LINKS.map(([l, h]) => <a key={h} href={h} className="hover:text-white">{l}</a>)}
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">X</a>
          </div>
          <span>© {new Date().getFullYear()} NullCash</span>
        </div>
      </footer>
    </section>
  );
}

export default function LandingPage() {
  const stats = useLiveStats();
  useEffect(() => { document.title = 'NullCash · Hit send. Leave no trace.'; }, []);
  return (
    <div className="nm-landing min-h-screen overflow-x-hidden bg-[#D9D9D9] text-[#202221]" data-testid="landing-page">
      <NmNav />
      <main>
        <Hero stats={stats} />
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
