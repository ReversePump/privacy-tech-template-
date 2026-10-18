import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, Plus } from "lucide-react";
import { makers } from "../lib/api";
import { fmtSol, fmtUsd, fmtNum, lamportsToSol, solscanTx, short } from "../lib/format";
import { Panel, KindPill, CoinAvatar, Loading, ExtLink } from "../components/bits";
import { useOurDesks, feedItemBlocked, listBlocked, PLATFORM_MINT } from "../lib/useOurDesks";
import { maskCoin, useMarketsMcap } from "../lib/alias";

function HeroActivity({ ourIds, hasOurs }) {
  const [items, setItems] = useState(null);
  const [oursRec, setOursRec] = useState({ desks: [], launches: [] });

  useEffect(() => {
    const load = () =>
      Promise.all([
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/our/desks`).then((r) => r.json()).catch(() => ({})),
        fetch(`${process.env.REACT_APP_BACKEND_URL}/api/our/launches`).then((r) => r.json()).catch(() => ({})),
      ]).then(([d, l]) => setOursRec({ desks: d.desks || [], launches: l.launches || [] }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hasOurs && !oursRec.launches.length) { setItems([]); return; }
    let live = true;
    const load = () =>
      makers.feed(100)
        .then((d) => {
          if (!live) return;
          const upstream = (d.items || []).filter((it) => ourIds.has(it.deskId) && !feedItemBlocked(it));
          const synth = [
            ...oursRec.launches.map((l) => ({ kind: "launch", mint: l.mint, ticker: l.ticker, imageUrl: l.imageUrl, at: l.createdAt, ours: true })),
            ...oursRec.desks.map((dk) => ({ kind: "onboard", mint: dk.mint, ticker: dk.ticker, imageUrl: dk.imageUrl, at: dk.createdAt, ours: true })),
          ];
          const seen = new Set(upstream.filter((i) => i.kind === "launch" && i.mint).map((i) => i.mint));
          setItems([...upstream, ...synth.filter((s) => !s.mint || !seen.has(s.mint))]
            .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 9));
        })
        .catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ourIds, hasOurs, oursRec]);
  return (
    <Panel className="w-full lg:w-[420px] shrink-0 overflow-hidden" data-testid="hero-activity-panel">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[#3F9E00]">
          <span className="h-1.5 w-1.5 rounded-[3px] bg-[#3F9E00] pip-blink" /> Live maker activity
        </span>
        <Link to="/live" className="font-mono text-[11px] uppercase tracking-wider text-[#93a184] hover:text-[#3F9E00]" data-testid="hero-all-activity-link">
          All activity →
        </Link>
      </div>
      <div>
        {!items && <Loading label="Connecting" />}
        {items?.map((it, i) => (
          <div key={it.signature || i} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 hover:bg-black/[0.03] transition-colors">
            <KindPill kind={it.kind} />
            <CoinAvatar url={it.imageUrl} name={it.ticker} size={20} className="rounded" />
            <span className="font-mono text-xs text-[#131a0f]">${it.ticker}</span>
            <span className="ml-auto font-mono text-xs text-[#5c6b50] tnum">
              {it.lamports != null ? lamportsToSol(it.lamports)?.toLocaleString("en-US", { maximumFractionDigits: 3 }) : ""}
            </span>
            {it.signature && (
              <ExtLink href={solscanTx(it.signature)} className="font-mono text-[10px]">{short(it.signature, 2, 2)}</ExtLink>
            )}
          </div>
        ))}
        {items && !items.length && (
          <div className="px-6 py-10 text-center" data-testid="hero-activity-empty">
            <div className="font-mono text-xs text-[#3F9E00]">Waiting for the first coin from this site</div>
            <p className="mt-2 text-[11px] font-light leading-relaxed text-[#93a184]">
              Only coins launched here — or makers added here — show up in this feed. Launch one and watch it land here the moment it finalizes on chain.
            </p>
            <Link to="/launch" className="mt-4 inline-flex h-8 items-center rounded-[3px] bg-[#3F9E00] px-4 text-xs font-medium text-[#131a0f] hover:bg-[#54C400]" data-testid="hero-empty-launch-btn">
              Launch the first coin
            </Link>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function Home() {
  const [config, setConfig] = useState(null);
  const { ourIds, loading } = useOurDesks();
  const caMcap = useMarketsMcap();
  const [liveDesks, setLiveDesks] = useState(null);

  useEffect(() => {
    makers.config().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => makers.desks({ limit: 60 }).then((d) => live && setLiveDesks(d.desks || [])).catch(() => live && setLiveDesks([]));
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const presets = config?.presets ? Object.entries(config.presets) : [];
  const hasOurs = ourIds.size > 0;
  const statsReady = liveDesks !== null;
  const desks = (liveDesks || [])
    .filter((d) => !listBlocked(d))
    .sort((a, b) =>
      (ourIds.has(b.id) ? 1 : 0) - (ourIds.has(a.id) ? 1 : 0) ||
      (b.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0) ||
      (Number(b.totals?.volumeLamports) || 0) - (Number(a.totals?.volumeLamports) || 0)
    )
    .slice(0, 9);

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 50% at 70% 20%, rgba(92,225,0,0.08), transparent 70%), radial-gradient(40% 40% at 20% 80%, rgba(92,225,0,0.05), transparent 70%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: "linear-gradient(rgba(19,26,15,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(19,26,15,0.05) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
        <div className="relative mx-auto max-w-[1440px] px-4 md:px-8 pt-16 md:pt-24 pb-14">
          <div className="flex flex-col lg:flex-row lg:items-start gap-10">
            <div className="min-w-0 flex-1">
              <div className="mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#5c6b50]">
                <span className="h-1.5 w-1.5 rounded-[3px] bg-[#3F9E00] pip-blink" />
                Market makers for memecoins · bonding curve native · Solana
              </div>
              <h1 className="text-[44px] leading-[0.98] md:text-[76px] font-medium tracking-tighter text-[#131a0f]" data-testid="hero-headline">
                your coin, with a<br /><em className="font-serif italic text-[#3F9E00]">market maker</em> built in.
              </h1>
              <p className="mt-6 max-w-md text-base md:text-lg font-light leading-relaxed text-[#5c6b50]">
                it buys the dips, it sells the rips<br />
                it runs on the coin's own creator fees<br />
                every dial stays in your hands
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/launch" data-testid="hero-launch-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-6 text-sm font-medium text-[#131a0f] hover:bg-[#54C400] hover:shadow-[0_0_24px_rgba(92,225,0,0.4)] transition-all">
                  <Rocket size={15} /> Launch a coin
                </Link>
                <Link to="/mm" data-testid="hero-anycoin-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-black/15 px-6 text-sm text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] transition-colors">
                  <Plus size={15} /> Onboard an existing coin
                </Link>
              </div>
            </div>
            <HeroActivity ourIds={ourIds} hasOurs={hasOurs && !loading} />
          </div>
        </div>
      </section>

      {/* LIVE MAKERS — this site's coins only */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-16" data-testid="home-makers">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-[#131a0f]">
            Market makers <em className="font-serif italic text-[#3F9E00]">live now.</em>
          </h2>
          <Link to="/explore" className="font-mono text-xs uppercase tracking-wider text-[#5c6b50] hover:text-[#3F9E00]" data-testid="home-explore-link">
            Explore all →
          </Link>
        </div>
        {statsReady && !desks.length && (
          <Panel className="px-6 py-14 text-center" data-testid="home-makers-empty">
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#3F9E00]">No coins from this site yet</div>
            <p className="mx-auto mt-3 max-w-md text-[13px] font-light leading-relaxed text-[#5c6b50]">
              This board only lists coins launched through this site or makers added through this site. Be the first — it shows up here the moment it lands on chain.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/launch" className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-5 text-sm font-medium text-[#131a0f] hover:bg-[#54C400]" data-testid="makers-empty-launch-btn">
                <Rocket size={14} /> Launch a coin
              </Link>
              <Link to="/mm" className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-black/15 px-5 text-sm text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00]" data-testid="makers-empty-mm-btn">
                <Plus size={14} /> Add a maker
              </Link>
            </div>
          </Panel>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {!statsReady && <Loading label="Loading makers" />}
          {desks?.map((d) => {
            const mk = maskCoin(d, ourIds.has(d.id), PLATFORM_MINT);
            return (
            <Link key={d.id} to={`/desk/${d.id}`} data-testid={`home-desk-${mk.ticker}`}>
              <Panel className="group h-full p-5 hover:border-[#3F9E00]/30 hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3">
                  <CoinAvatar url={mk.imageUrl} name={mk.name} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-[#131a0f] group-hover:text-[#3F9E00] transition-colors">{mk.name}</div>
                    <div className="font-mono text-[11px] text-[#93a184]">${mk.ticker}</div>
                  </div>
                  <span className={`ml-auto h-1.5 w-1.5 rounded-[3px] ${d.status === "running" ? "bg-[#38c973] pip-blink" : "bg-[#556b82]"}`} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#93a184]">Mcap</div>
                    <div className="mt-0.5 text-[#131a0f] tnum">{fmtUsd(d.mint === PLATFORM_MINT && caMcap != null ? caMcap : d.market?.mcapUsd)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#93a184]">Volume</div>
                    <div className="mt-0.5 text-[#131a0f] tnum">{fmtSol(d.totals?.volumeLamports, 1)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#93a184]">24h trades</div>
                    <div className="mt-0.5 text-[#131a0f] tnum">{fmtNum(d.totals?.trades24h)}</div>
                  </div>
                </div>
              </Panel>
            </Link>
            );
          })}
        </div>
      </section>

      {/* MONEY FLOW */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-20" data-testid="home-money-flow">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#3F9E00]">The journey of every SOL</div>
        <h2 className="max-w-xl text-2xl md:text-4xl font-medium tracking-tight text-[#131a0f]">
          One signature wires the <em className="font-serif italic text-[#3F9E00]">whole maker.</em>
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-light text-[#5c6b50]">
          From then on the vault collects fees, feeds the trading wallets and settles up with you — on its own.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Your wallet", "Approves the launch. SOL only ever flows out to you — plus a fixed 20% profit cut that gets torched forever.", "YOU"],
            ["The maker's vault", "Holds the market maker's capital and your pending payouts. Claims the coin's fees by itself.", "VAULT"],
            ["Trading wallets", "One to ten of them, each running its own book and price lines. All public, all on-chain.", "WALLETS"],
            ["The coin's market", "Buys below its reference lines, sells above entry. Bonding curve first, then its liquidity pool.", "THE CURVE"],
          ].map(([t, b, k], i) => (
            <Panel key={t} className="p-5 hover:border-[#3F9E00]/25 transition-colors">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#93a184]">{String(i + 1).padStart(2, "0")} · {k}</div>
              <div className="mt-3 text-[#131a0f] font-medium">{t}</div>
              <p className="mt-2 text-[13px] font-light leading-relaxed text-[#5c6b50]">{b}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* PRESETS */}
      {presets.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-20" data-testid="home-presets">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#3F9E00]">Temperament</div>
          <h2 className="text-2xl md:text-4xl font-medium tracking-tight text-[#131a0f]">
            Pick a temperament. <em className="font-serif italic text-[#3F9E00]">Retune it anytime.</em>
          </h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {presets.map(([key, p]) => (
              <Panel key={key} className="p-5">
                <div className="text-[#131a0f] font-medium">{p.name}</div>
                <p className="mt-1.5 text-[12px] font-light text-[#5c6b50]">{p.summary}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/5 pt-3 font-mono text-[11px]">
                  <div><div className="text-[9px] uppercase text-[#93a184]">Buy dips</div><div className="text-[#3F9E00]">{p.values.buyTriggerPct}%</div></div>
                  <div><div className="text-[9px] uppercase text-[#93a184]">Sell rises</div><div className="text-[#3F9E00]">{p.values.sellTriggerPct}%</div></div>
                  <div><div className="text-[9px] uppercase text-[#93a184]">Stop-loss</div><div className="text-[#3F9E00]">{p.values.stopLossPct ?? "off"}%</div></div>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-24" data-testid="home-cta">
        <Panel className="relative overflow-hidden px-6 py-14 md:py-20 text-center">
          <div className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(50% 60% at 50% 100%, rgba(92,225,0,0.12), transparent 70%)" }} />
          <h2 className="relative text-3xl md:text-5xl font-medium tracking-tight text-[#131a0f]">
            Ship your coin with a <em className="font-serif italic text-[#3F9E00]">market maker</em> built in.
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-sm font-light text-[#5c6b50]">
            One approval from your wallet mints the coin, locks its fee split and funds the maker. Every dial remains yours after that.
          </p>
          <div className="relative mt-8 flex justify-center gap-3">
            <Link to="/launch" data-testid="cta-launch-btn"
              className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-6 text-sm font-medium text-[#131a0f] hover:bg-[#54C400] hover:shadow-[0_0_24px_rgba(92,225,0,0.4)] transition-all">
              <Rocket size={15} /> Launch a coin
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-black/15 px-6 text-sm text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] transition-colors" data-testid="cta-docs-btn">
              Read the docs
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}
