import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import TopNav, { APP_URL } from '../components/TopNav';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const BF = `${BACKEND}/api/bifrost/v1`;
const ALPENGLOW_POST = 'https://x.com/solana_devs/status/2112892922136055937';

/* ---------------- live pool data ---------------- */
function useLiveStats() {
  const [s, setS] = useState({ leaves: null, nullifiers: null, assets: null, live: false, flash: 0 });
  useEffect(() => {
    let dead = false;
    const j = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const stats = () => {
      if (document.hidden) return;
      j(`${BF}/indexer/v1/stats`)
        .then((d) => !dead && setS((p) => ({
          ...p, leaves: d.leaves, nullifiers: d.nullifiers, live: true,
          flash: p.leaves != null && d.leaves !== p.leaves ? p.flash + 1 : p.flash,
        })))
        .catch(() => !dead && setS((p) => ({ ...p, live: false })));
    };
    const assets = () => {
      if (document.hidden) return;
      j(`${BF}/indexer/v1/assets`).then((d) => !dead && setS((p) => ({ ...p, assets: (d.assets || []).length }))).catch(() => {});
    };
    stats(); assets();
    const t1 = setInterval(stats, 5000);
    const t2 = setInterval(assets, 60000);
    return () => { dead = true; clearInterval(t1); clearInterval(t2); };
  }, []);
  return s;
}
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());

/* ---------------- motion ---------------- */
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
      className={`transition-all duration-700 ease-[cubic-bezier(.16,1,.3,1)] ${on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} ${className}`}>
      {children}
    </div>
  );
}

/* ---------------- type ---------------- */
const serif = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };

function Eyebrow({ children }) {
  return (
    <div className="flex items-center gap-2.5" style={mono}>
      <span className="h-px w-7 bg-[#a9e7c0]/50" />
      <span className="text-[11px] uppercase tracking-[.26em] text-[#a9e7c0]">{children}</span>
    </div>
  );
}

/* ---------------- line-art sketches (inline SVG only) ---------------- */
function HeroSketch() {
  return (
    <svg viewBox="0 0 440 400" className="w-full max-w-[440px] ck-float" fill="none" aria-hidden="true" data-testid="hero-sketch">
      <g stroke="#a9e7c0" strokeOpacity=".22" strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={40 + i * 45} y1="30" x2={40 + i * 45} y2="380" />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="30" y1={40 + i * 45} x2="410" y2={40 + i * 45} />
        ))}
      </g>
      {/* nested diamonds — the cloak */}
      {[150, 112, 76, 42].map((r, i) => (
        <path key={r} d={`M220 ${200 - r} L${220 + r} 200 L220 ${200 + r} L${220 - r} 200 Z`}
          stroke="#a9e7c0" strokeOpacity={0.28 + i * 0.18} strokeWidth="1.4"
          className="ck-draw" style={{ animationDelay: `${0.25 + i * 0.28}s` }} />
      ))}
      <circle cx="220" cy="200" r="5" fill="#a9e7c0" className="ck-pulse" />
      {/* flow lines entering and leaving — link visibly broken */}
      <path d="M60 118 L168 172" stroke="#eef6f0" strokeOpacity=".5" strokeWidth="1.4" strokeDasharray="5 7" className="ck-dash" />
      <circle cx="60" cy="118" r="4" stroke="#eef6f0" strokeOpacity=".7" strokeWidth="1.4" />
      <path d="M272 228 L382 284" stroke="#eef6f0" strokeOpacity=".5" strokeWidth="1.4" strokeDasharray="5 7" className="ck-dash" style={{ animationDelay: '.9s' }} />
      <circle cx="382" cy="284" r="4" stroke="#eef6f0" strokeOpacity=".7" strokeWidth="1.4" />
      <text x="52" y="102" fill="#8fa695" fontSize="10" style={mono} letterSpacing="2">PUBLIC IN</text>
      <text x="330" y="308" fill="#8fa695" fontSize="10" style={mono} letterSpacing="2">UNLINKED OUT</text>
      <text x="186" y="52" fill="#a9e7c0" fontSize="10" style={mono} letterSpacing="2">GROTH16 PROOF</text>
    </svg>
  );
}

function PoolSketch() {
  return (
    <svg viewBox="0 0 120 120" className="h-14 w-14" fill="none" aria-hidden="true">
      <path d="M60 14 106 60 60 106 14 60Z" stroke="#a9e7c0" strokeWidth="1.5" />
      <path d="M60 32 88 60 60 88 32 60Z" stroke="#a9e7c0" strokeOpacity=".55" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="4" fill="#a9e7c0" />
    </svg>
  );
}
function ProofSketch() {
  return (
    <svg viewBox="0 0 120 120" className="h-14 w-14" fill="none" aria-hidden="true">
      <rect x="18" y="34" width="84" height="52" rx="4" stroke="#a9e7c0" strokeWidth="1.5" />
      <path d="M30 52h18l6-10 8 26 6-16h22" stroke="#a9e7c0" strokeOpacity=".7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 70h60" stroke="#a9e7c0" strokeOpacity=".3" strokeWidth="1" strokeDasharray="3 5" />
    </svg>
  );
}
function NullifierSketch() {
  return (
    <svg viewBox="0 0 120 120" className="h-14 w-14" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="38" stroke="#a9e7c0" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="22" stroke="#a9e7c0" strokeOpacity=".5" strokeWidth="1.2" strokeDasharray="4 5" />
      <path d="M38 82 82 38" stroke="#a9e7c0" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function PulseRings() {
  return (
    <svg viewBox="0 0 160 160" className="h-24 w-24" fill="none" aria-hidden="true">
      {[64, 46, 28].map((r, i) => (
        <circle key={r} cx="80" cy="80" r={r} stroke="#a9e7c0" strokeOpacity=".5" strokeWidth="1.3"
          className="ck-ring" style={{ animationDelay: `${i * 0.55}s` }} />
      ))}
      <circle cx="80" cy="80" r="6" fill="#a9e7c0" className="ck-pulse" />
      <text x="80" y="150" textAnchor="middle" fill="#8fa695" fontSize="11" style={mono} letterSpacing="2">~150 MS</text>
    </svg>
  );
}

/* ---------------- content ---------------- */
const STEPS = [
  { n: '01', t: 'Cloak in', d: 'Deposit any Solana token. It becomes a sealed note inside a shared zero-knowledge pool — one shape in a crowd of thousands.', sketch: <PoolSketch /> },
  { n: '02', t: 'Move unseen', d: 'Pay, trade or exit while the pool signs for you. Every move is a Groth16 proof: valid, verified, and empty of you.', sketch: <ProofSketch /> },
  { n: '03', t: 'Surface anywhere', d: 'Leave to a fresh Solana address or another chain entirely. Nothing connects where you entered to where you appear.', sketch: <NullifierSketch /> },
];

const MODEL = [
  { t: 'Groth16 · BN254', d: 'Every transfer is a succinct proof, verified on-chain in a single transaction. The chain learns that a move was valid — never who made it.' },
  { t: 'Poseidon Merkle tree', d: 'Notes live as commitments in a 26-level tree with room for 67 million of them. Your balance is provably inside, and visibly nowhere.' },
  { t: 'Nullifiers', d: 'Spending publishes a single-use nullifier that blocks double-spends. It carries no link back to the note — or to you.' },
];

const FEES = [
  ['Cloak in', '0.3%', 'your wallet pays Solana gas'],
  ['Private payment', 'free', 'gas covered by the relayer'],
  ['Private trade', '0.3% of input', 'gas covered by the relayer'],
  ['Exit to Solana', '0.3% of amount', 'relayer signs, you stay unnamed'],
  ['Cross-chain route', 'in the quote', 'one deposit, any chain'],
];

const FAQS = [
  ['Who holds my keys?', 'Only you. Keys are derived and encrypted on your device — nothing to reset, nothing we can touch.'],
  ['Do I need a wallet to use routes?', 'No. Private route and Privacy swap work from any sender: pick tokens, paste a destination, send one deposit.'],
  ['Am I fully anonymous?', 'The on-chain link between your deposit and your later moves is gone. Timing and amounts are your own craft.'],
  ['What if I lose my recovery key?', 'Nobody can recover the vault — that is the point. Write it down, keep it offline.'],
];

/* ---------------- page ---------------- */
export default function LandingPage() {
  const s = useLiveStats();
  return (
    <div className="min-h-screen bg-[#080c09] text-[#eef6f0] antialiased" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }} data-testid="landing-page">
      <div className="pointer-events-none fixed inset-0 -z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{
          background:
            'radial-gradient(1000px 520px at 85% -10%, rgba(169,231,192,.09), transparent 62%),' +
            'radial-gradient(720px 460px at -10% 110%, rgba(169,231,192,.05), transparent 60%)',
        }} />
        <div className="absolute inset-0 ck-grid" />
      </div>
      <TopNav />

      {/* ---------- hero ---------- */}
      <section className="relative mx-auto max-w-6xl px-4 pt-[130px] sm:px-6 lg:pt-[150px]">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <Reveal><Eyebrow>Solana · zero-knowledge pool</Eyebrow></Reveal>
            <Reveal delay={90}>
              <h1 className="mt-6 text-[44px] leading-[1.02] tracking-[-0.01em] text-[#eef6f0] sm:text-[64px] lg:text-[76px]"
                style={serif} data-testid="hero-headline">
                Disappear from the{' '}
                <em className="text-[#a9e7c0]">public ledger.</em>
              </h1>
            </Reveal>
            <Reveal delay={180}>
              <p className="mt-6 max-w-[520px] text-[15px] leading-relaxed text-[#8fa695] sm:text-[17px]">
                Cloak Privacy seals your tokens inside a shared zero-knowledge pool on Solana.
                Pay, trade and exit anywhere — amounts, addresses and history stay yours alone.
              </p>
            </Reveal>
            <Reveal delay={260}>
              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <a href={APP_URL} data-testid="hero-cta-open"
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-[#c8f3d8] to-[#a9e7c0] px-7 text-[15px] font-semibold text-[#07130c] transition hover:shadow-[0_14px_36px_-10px_rgba(169,231,192,.5)]">
                  Enter the pool <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
                <a href="#flow" data-testid="hero-cta-docs"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-[#a9e7c0]/25 px-7 text-[15px] text-[#c9d8cc] transition hover:border-[#a9e7c0]/55 hover:text-white">
                  How the cloak works
                </a>
              </div>
            </Reveal>
            <Reveal delay={340}>
              <div className="mt-10 flex items-center gap-2 text-[12px] text-[#566b5c]" style={mono}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.live ? 'bg-[#a9e7c0] ck-live' : 'bg-[#566b5c]'}`} />
                {s.live ? 'LIVE ON SOLANA MAINNET' : 'CONNECTING TO MAINNET…'}
              </div>
            </Reveal>
          </div>
          <Reveal delay={200} className="hidden justify-center lg:flex">
            <HeroSketch />
          </Reveal>
        </div>
      </section>

      {/* ---------- live strip ---------- */}
      <section className="relative mx-auto mt-16 max-w-6xl px-4 sm:px-6" aria-label="Live pool statistics">
        <Reveal>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#a9e7c0]/12 bg-[#a9e7c0]/8 sm:grid-cols-4" data-testid="live-pool-strip">
            {[
              ['Sealed notes', fmt(s.leaves), 'stat-sealed-notes'],
              ['Nullifiers spent', fmt(s.nullifiers), 'stat-nullifiers'],
              ['Tokens verified', fmt(s.assets), 'stat-assets'],
              ['Finality', '~150 ms', 'stat-alpenglow-time'],
            ].map(([k, v, id]) => (
              <div key={k} className="bg-[#0d140e] px-6 py-6">
                <div className="text-[10.5px] uppercase tracking-[.22em] text-[#7fb894]" style={mono}>{k}</div>
                <div key={`${id}-${s.flash}`} className="mt-2 text-[30px] text-[#eef6f0] ck-stat" style={serif} data-testid={id}>{v}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- 01/02/03 flow ---------- */}
      <section id="flow" className="relative mx-auto mt-28 max-w-6xl scroll-mt-24 px-4 sm:px-6">
        <Reveal><Eyebrow>The protocol flow</Eyebrow></Reveal>
        <Reveal delay={80}>
          <h2 className="mt-5 max-w-[620px] text-[32px] leading-[1.06] sm:text-[46px]" style={serif}>
            Three moves. <em className="text-[#a9e7c0]">No trace.</em>
          </h2>
        </Reveal>
        <div className="mt-12 space-y-px overflow-hidden rounded-2xl border border-[#a9e7c0]/12">
          {STEPS.map((st, i) => (
            <Reveal key={st.n} delay={i * 90}>
              <div className="group grid items-center gap-6 bg-[#0d140e] p-7 transition-colors duration-300 hover:bg-[#111a13] sm:grid-cols-[70px_1fr_auto] sm:p-9"
                data-testid={`how-it-works-step-${i + 1}`}>
                <span className="text-[15px] text-[#566b5c]" style={mono}>{st.n}.</span>
                <div>
                  <h3 className="text-[22px] text-[#eef6f0]" style={serif}>{st.t}</h3>
                  <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-[#8fa695]">{st.d}</p>
                </div>
                <div className="opacity-80 transition duration-500 group-hover:scale-110 group-hover:opacity-100">{st.sketch}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- privacy model ---------- */}
      <section id="zk" className="relative mx-auto mt-28 max-w-6xl scroll-mt-24 px-4 sm:px-6">
        <Reveal><Eyebrow>Under the cloak</Eyebrow></Reveal>
        <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <h2 className="text-[32px] leading-[1.06] sm:text-[46px]" style={serif}>
              Proven, not <em className="text-[#a9e7c0]">promised.</em>
            </h2>
            <p className="mt-5 max-w-[420px] text-[14.5px] leading-relaxed text-[#8fa695]">
              No mixers, no relays of trust. Cloak Privacy is arithmetic: your browser proves a note exists
              and that you hold its key. Solana verifies the proof. Nothing else is ever revealed.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px] text-[#7fb894]" style={mono} data-testid="zk-pipeline">
              {['YOUR SECRET', 'CIRCUIT', 'PROOF', 'ON-CHAIN CHECK', 'VALID — NOTHING ELSE'].map((p, i) => (
                <React.Fragment key={p}>
                  {i > 0 && <span className="text-[#3a684b]">→</span>}
                  <span className="rounded-full border border-[#a9e7c0]/18 px-3 py-1.5">{p}</span>
                </React.Fragment>
              ))}
            </div>
          </Reveal>
          <div className="space-y-px overflow-hidden rounded-2xl border border-[#a9e7c0]/12">
            {MODEL.map((m, i) => (
              <Reveal key={m.t} delay={i * 90}>
                <div className="bg-[#0d140e] p-7 transition-colors duration-300 hover:bg-[#111a13] sm:p-8" data-testid={`privacy-card-${i + 1}`}>
                  <h3 className="text-[19px] text-[#eef6f0]" style={serif}>{m.t}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#8fa695]">{m.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- alpenglow ---------- */}
      <section className="relative mx-auto mt-28 max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="grid items-center gap-10 rounded-3xl border border-[#a9e7c0]/14 bg-gradient-to-br from-[#0d140e] to-[#0a100c] p-8 sm:p-12 lg:grid-cols-[auto_1fr]" data-testid="alpenglow-section">
            <PulseRings />
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#a9e7c0]/25 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[.22em] text-[#a9e7c0]" style={mono} data-testid="alpenglow-badge">
                First Alpenglow-era ZK shield on Solana
              </div>
              <h2 className="mt-5 text-[30px] leading-[1.06] sm:text-[42px]" style={serif}>
                Final before you <em className="text-[#a9e7c0]">blink twice.</em>
              </h2>
              <p className="mt-4 max-w-[560px] text-[14.5px] leading-relaxed text-[#8fa695]">
                Alpenglow is Solana's new consensus engine — Votor and Rotor — pushing finality to roughly
                150 milliseconds. Cloak Privacy is built for it: proofs land, settle and vanish in a blink.
              </p>
              <a href={ALPENGLOW_POST} target="_blank" rel="noopener noreferrer" data-testid="alpenglow-link"
                className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] text-[#a9e7c0] transition hover:text-[#c8f3d8]">
                Read about Alpenglow <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- fees ---------- */}
      <section id="fees" className="relative mx-auto mt-28 max-w-6xl scroll-mt-24 px-4 sm:px-6">
        <Reveal><Eyebrow>Honest arithmetic</Eyebrow></Reveal>
        <Reveal delay={80}>
          <h2 className="mt-5 text-[32px] leading-[1.06] sm:text-[46px]" style={serif}>
            Fees you can <em className="text-[#a9e7c0]">read.</em>
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-[#a9e7c0]/12" data-testid="fees-table">
            {FEES.map(([a, b, c], i) => (
              <div key={a} className={`grid grid-cols-[1fr_auto] items-baseline gap-2 px-6 py-5 sm:grid-cols-[1fr_220px_1fr] sm:gap-6 sm:px-8 ${i % 2 ? 'bg-[#0d140e]' : 'bg-[#0a100c]'}`} data-testid={`fee-row-${i}`}>
                <span className="text-[15px] text-[#eef6f0]">{a}</span>
                <span className="text-[15px] italic text-[#a9e7c0]" style={serif}>{b}</span>
                <span className="col-span-2 text-[12.5px] text-[#566b5c] sm:col-span-1 sm:text-right" style={mono}>{c}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- faq ---------- */}
      <section className="relative mx-auto mt-28 max-w-3xl px-4 sm:px-6">
        <Reveal><Eyebrow>Quiet answers</Eyebrow></Reveal>
        <div className="mt-8 divide-y divide-[#a9e7c0]/10 rounded-2xl border border-[#a9e7c0]/12" data-testid="faq-list">
          {FAQS.map(([q, a], i) => (
            <details key={q} className="group bg-[#0d140e] px-6 py-5 open:bg-[#111a13]" data-testid={`faq-${i}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] text-[#eef6f0] [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-[#7fb894] transition-transform duration-300 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-[#8fa695]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="relative mx-auto mt-28 max-w-6xl px-4 pb-10 sm:px-6">
        <Reveal>
          <div className="ck-cta relative overflow-hidden rounded-3xl border border-[#a9e7c0]/16 px-8 py-16 text-center sm:py-20">
            <h2 className="mx-auto max-w-[640px] text-[34px] leading-[1.05] sm:text-[52px]" style={serif}>
              The crowd is waiting. <em className="text-[#a9e7c0]">Blend in.</em>
            </h2>
            <p className="mx-auto mt-5 max-w-[460px] text-[14.5px] text-[#8fa695]">
              Open the vault, cloak your first tokens, and move like nobody is watching — because provably, nobody is.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
              <a href={APP_URL} data-testid="bottom-cta-launch-app"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-[#c8f3d8] to-[#a9e7c0] px-8 text-[15px] font-semibold text-[#07130c] transition hover:shadow-[0_14px_36px_-10px_rgba(169,231,192,.5)]">
                Open Cloak Privacy <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
              <a href="/docs" data-testid="bottom-cta-docs"
                className="inline-flex h-12 items-center rounded-full border border-[#a9e7c0]/25 px-8 text-[15px] text-[#c9d8cc] transition hover:border-[#a9e7c0]/55 hover:text-white">
                Read the docs
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="relative border-t border-[#a9e7c0]/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-[19px] text-[#eef6f0]" style={serif}>Cloak <span className="text-[#7fb894]">Privacy</span></div>
            <p className="mt-1.5 text-[12.5px] text-[#566b5c]">Private money on Solana. Proofs in, nothing out.</p>
          </div>
          <nav className="flex flex-wrap gap-x-7 gap-y-3 text-[13px] text-[#8fa695]" data-testid="footer-links">
            <a href="/#flow" className="transition hover:text-white">How it works</a>
            <a href="/#zk" className="transition hover:text-white">Privacy model</a>
            <a href="/docs" className="transition hover:text-white">Docs</a>
            <a href="/#fees" className="transition hover:text-white">Fees</a>
            <a href={APP_URL} className="transition hover:text-white">Open app</a>
          </nav>
        </div>
        <div className="border-t border-[#a9e7c0]/8">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 text-[11px] text-[#3a684b] sm:px-6" style={mono}>
            <span>© {new Date().getFullYear()} CLOAK PRIVACY</span>
            <span data-testid="footer-solana-status">SOLANA MAINNET · {s.live ? 'LIVE' : 'SYNCING'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
