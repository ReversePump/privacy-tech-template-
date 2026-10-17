import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, Plus } from "lucide-react";
import { makers } from "../lib/api";
import { fmtSol, fmtUsd, fmtNum, fmtAge, lamportsToSol, solscanTx, short } from "../lib/format";
import { Panel, Stat, StatRow, KindPill, CoinAvatar, Loading, ExtLink } from "../components/bits";

function HeroActivity() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => makers.feed(9).then((d) => live && setItems(d.items || [])).catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return (
    <Panel className="w-full lg:w-[420px] shrink-0 overflow-hidden" data-testid="hero-activity-panel">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[#8AF5D0]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8AF5D0] pip-blink" /> Live maker activity
        </span>
        <Link to="/live" className="font-mono text-[11px] uppercase tracking-wider text-[#556b82] hover:text-[#8AF5D0]" data-testid="hero-all-activity-link">
          All activity →
        </Link>
      </div>
      <div>
        {!items && <Loading label="Connecting" />}
        {items?.map((it, i) => (
          <div key={it.signature || i} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/[0.02] transition-colors">
            <KindPill kind={it.kind} />
            <CoinAvatar url={it.imageUrl} name={it.ticker} size={20} className="rounded" />
            <span className="font-mono text-xs text-white">${it.ticker}</span>
            <span className="ml-auto font-mono text-xs text-[#8ca3b8] tnum">
              {it.lamports != null ? lamportsToSol(it.lamports)?.toLocaleString("en-US", { maximumFractionDigits: 3 }) : ""}
            </span>
            {it.signature && (
              <ExtLink href={solscanTx(it.signature)} className="font-mono text-[10px]">{short(it.signature, 2, 2)}</ExtLink>
            )}
          </div>
        ))}
        {items && !items.length && <div className="px-4 py-8 text-center font-mono text-xs text-[#556b82]">No activity yet</div>}
      </div>
    </Panel>
  );
}

export default function Home() {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [desks, setDesks] = useState(null);

  useEffect(() => {
    makers.stats().then(setStats).catch(() => {});
    makers.config().then(setConfig).catch(() => {});
    makers.desks().then((d) => setDesks((d.desks || []).slice(0, 6))).catch(() => setDesks([]));
  }, []);

  const presets = config?.presets ? Object.entries(config.presets) : [];

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 50% at 70% 20%, rgba(138,245,208,0.08), transparent 70%), radial-gradient(40% 40% at 20% 80%, rgba(138,245,208,0.05), transparent 70%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
        <div className="relative mx-auto max-w-[1440px] px-4 md:px-8 pt-16 md:pt-24 pb-14">
          <div className="flex flex-col lg:flex-row lg:items-start gap-10">
            <div className="min-w-0 flex-1">
              <div className="mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#8ca3b8]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8AF5D0] pip-blink" />
                Market maker launchpad · pump.fun · Solana
              </div>
              <h1 className="text-[52px] leading-[0.95] md:text-[92px] font-medium tracking-tighter text-white" data-testid="hero-headline">
                every coin gets<br />a <em className="font-serif italic text-[#8AF5D0]">market maker.</em>
              </h1>
              <p className="mt-6 max-w-md text-base md:text-lg font-light leading-relaxed text-[#8ca3b8]">
                buys the dips, sells the rises<br />
                funded by its own creator rewards<br />
                every setting yours, after launch
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/launch" data-testid="hero-launch-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_24px_rgba(138,245,208,0.4)] transition-all">
                  <Rocket size={15} /> Launch a coin
                </Link>
                <Link to="/mm" data-testid="hero-anycoin-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-6 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors">
                  <Plus size={15} /> Add a maker to any coin
                </Link>
              </div>
            </div>
            <HeroActivity />
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8" data-testid="home-stats">
        <StatRow>
          <Stat testId="stat-makers" label="Makers running" value={stats ? fmtNum(stats.liveDesks) : "—"} sub={stats ? `${fmtNum(stats.desks)} launched or added` : ""} />
          <Stat testId="stat-wallets" label="Trading wallets" value={stats ? fmtNum(stats.wallets) : "—"} sub="every one public" />
          <Stat testId="stat-volume" label="Volume traded" value={stats ? fmtSol(stats.volumeLamports, 1) : "—"} />
          <Stat testId="stat-claimed" label="Rewards claimed" value={stats ? fmtSol(stats.claimedLamports, 1) : "—"} />
          <Stat testId="stat-realized" label="Realized P&L" value={stats ? fmtSol(stats.realizedLamports, 3) : "—"} />
          <Stat testId="stat-paidout" label="Paid to owners" value={stats ? fmtSol(stats.paidOutLamports, 2) : "—"} />
          <Stat testId="stat-trades24" label="Trades 24h" value={stats ? fmtNum(stats.trades24h) : "—"} sub="finalized on chain" />
        </StatRow>
      </section>

      {/* LIVE MAKERS */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-16" data-testid="home-makers">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-white">
            Live <em className="font-serif italic text-[#8AF5D0]">makers</em>
          </h2>
          <Link to="/explore" className="font-mono text-xs uppercase tracking-wider text-[#8ca3b8] hover:text-[#8AF5D0]" data-testid="home-explore-link">
            Explore all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {!desks && <Loading label="Loading makers" />}
          {desks?.map((d) => (
            <Link key={d.id} to={`/desk/${d.id}`} data-testid={`home-desk-${d.ticker}`}>
              <Panel className="group h-full p-5 hover:border-[#8AF5D0]/30 hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3">
                  <CoinAvatar url={d.imageUrl} name={d.name} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-white group-hover:text-[#8AF5D0] transition-colors">{d.name}</div>
                    <div className="font-mono text-[11px] text-[#556b82]">${d.ticker}</div>
                  </div>
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${d.status === "running" ? "bg-[#38c973] pip-blink" : "bg-[#556b82]"}`} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#556b82]">Mcap</div>
                    <div className="mt-0.5 text-white tnum">{fmtUsd(d.market?.mcapUsd)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#556b82]">Volume</div>
                    <div className="mt-0.5 text-white tnum">{fmtSol(d.totals?.volumeLamports, 1)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#556b82]">24h trades</div>
                    <div className="mt-0.5 text-white tnum">{fmtNum(d.totals?.trades24h)}</div>
                  </div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </section>

      {/* MONEY FLOW */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-20" data-testid="home-money-flow">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#8AF5D0]">How the money moves</div>
        <h2 className="max-w-xl text-2xl md:text-4xl font-medium tracking-tight text-white">
          One launch transaction sets <em className="font-serif italic text-[#8AF5D0]">everything</em> up.
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-light text-[#8ca3b8]">
          After that the treasury claims the rewards, funds the wallets and pays you.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Your wallet", "Signs the launch. The only place SOL ever leaves a maker to, apart from the 20% profit fee that is burned for good.", "OWNER"],
            ["The maker's treasury", "Holds capital and what it owes you. Signs its own reward claims.", "TREASURY"],
            ["Trading wallets", "1–10 wallets. Each keeps its own book and lines. All listed publicly.", "WALLETS"],
            ["The coin's market", "Buys dips under their reference, sells rises over their entry. Bonding curve, then its PumpSwap pool.", "PUMP.FUN"],
          ].map(([t, b, k], i) => (
            <Panel key={t} className="p-5 hover:border-[#8AF5D0]/25 transition-colors">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">{String(i + 1).padStart(2, "0")} · {k}</div>
              <div className="mt-3 text-white font-medium">{t}</div>
              <p className="mt-2 text-[13px] font-light leading-relaxed text-[#8ca3b8]">{b}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* PRESETS */}
      {presets.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-20" data-testid="home-presets">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#8AF5D0]">Settings</div>
          <h2 className="text-2xl md:text-4xl font-medium tracking-tight text-white">
            Start from a preset. <em className="font-serif italic text-[#8AF5D0]">Change anything later.</em>
          </h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {presets.map(([key, p]) => (
              <Panel key={key} className="p-5">
                <div className="text-white font-medium">{p.name}</div>
                <p className="mt-1.5 text-[12px] font-light text-[#8ca3b8]">{p.summary}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 font-mono text-[11px]">
                  <div><div className="text-[9px] uppercase text-[#556b82]">Buy dips</div><div className="text-[#8AF5D0]">{p.values.buyTriggerPct}%</div></div>
                  <div><div className="text-[9px] uppercase text-[#556b82]">Sell rises</div><div className="text-[#8AF5D0]">{p.values.sellTriggerPct}%</div></div>
                  <div><div className="text-[9px] uppercase text-[#556b82]">Stop-loss</div><div className="text-[#8AF5D0]">{p.values.stopLossPct ?? "off"}%</div></div>
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
            style={{ background: "radial-gradient(50% 60% at 50% 100%, rgba(138,245,208,0.12), transparent 70%)" }} />
          <h2 className="relative text-3xl md:text-5xl font-medium tracking-tight text-white">
            Launch your coin with its <em className="font-serif italic text-[#8AF5D0]">own maker.</em>
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-sm font-light text-[#8ca3b8]">
            One wallet signature creates the coin on pump.fun, locks its reward split and funds its maker. Every setting stays yours to change after launch.
          </p>
          <div className="relative mt-8 flex justify-center gap-3">
            <Link to="/launch" data-testid="cta-launch-btn"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_24px_rgba(138,245,208,0.4)] transition-all">
              <Rocket size={15} /> Launch a coin
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-6 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors" data-testid="cta-docs-btn">
              Read the docs
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}
