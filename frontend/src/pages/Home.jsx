import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, Plus } from "lucide-react";
import { makers } from "../lib/api";
import { fmtSol, fmtSolSigned, fmtUsd, fmtNum, lamportsToSol, solscanTx, short } from "../lib/format";
import { Panel, Stat, StatRow, KindPill, CoinAvatar, Loading, ExtLink } from "../components/bits";
import { useOurDesks } from "../lib/useOurDesks";

function HeroActivity({ ourIds, hasOurs }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!hasOurs) { setItems([]); return; }
    let live = true;
    const load = () =>
      makers.feed(100)
        .then((d) => live && setItems((d.items || []).filter((it) => ourIds.has(it.deskId)).slice(0, 9)))
        .catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, [ourIds, hasOurs]);
  return (
    <Panel className="w-full lg:w-[420px] shrink-0 overflow-hidden" data-testid="hero-activity-panel">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[#8AF5D0]">
          <span className="h-1.5 w-1.5 rounded-[3px] bg-[#8AF5D0] pip-blink" /> Live maker activity
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
        {items && !items.length && (
          <div className="px-6 py-10 text-center" data-testid="hero-activity-empty">
            <div className="font-mono text-xs text-[#8AF5D0]">Waiting for the first coin from this site</div>
            <p className="mt-2 text-[11px] font-light leading-relaxed text-[#556b82]">
              Only coins launched here — or makers added here — show up in this feed. Launch one and watch it land here the moment it finalizes on chain.
            </p>
            <Link to="/launch" className="mt-4 inline-flex h-8 items-center rounded-[3px] bg-[#8AF5D0] px-4 text-xs font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="hero-empty-launch-btn">
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
  const { ours, ourIds, loading } = useOurDesks();

  useEffect(() => {
    makers.config().then(setConfig).catch(() => {});
  }, []);

  const presets = config?.presets ? Object.entries(config.presets) : [];
  const desks = ours;
  const hasOurs = ourIds.size > 0;
  const sum = (fn) => (desks || []).reduce((a, d) => a + (fn(d) || 0), 0);
  const sumSol = (fn) => sum((d) => lamportsToSol(fn(d)) || 0);
  const statsReady = desks !== null;

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
                <span className="h-1.5 w-1.5 rounded-[3px] bg-[#8AF5D0] pip-blink" />
                Market makers for memecoins · bonding curve native · Solana
              </div>
              <h1 className="text-[44px] leading-[0.98] md:text-[76px] font-medium tracking-tighter text-white" data-testid="hero-headline">
                your coin, with a<br /><em className="font-serif italic text-[#8AF5D0]">market maker</em> built in.
              </h1>
              <p className="mt-6 max-w-md text-base md:text-lg font-light leading-relaxed text-[#8ca3b8]">
                it buys the dips, it sells the rips<br />
                it runs on the coin's own creator fees<br />
                every dial stays in your hands
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/launch" data-testid="hero-launch-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_24px_rgba(138,245,208,0.4)] transition-all">
                  <Rocket size={15} /> Launch a coin
                </Link>
                <Link to="/mm" data-testid="hero-anycoin-btn"
                  className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-white/15 px-6 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors">
                  <Plus size={15} /> Onboard an existing coin
                </Link>
              </div>
            </div>
            <HeroActivity ourIds={ourIds} hasOurs={hasOurs && !loading} />
          </div>
        </div>
      </section>

      {/* STATS — this site's coins only */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8" data-testid="home-stats">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#556b82]">Coins launched or added through this site</div>
        <StatRow>
          <Stat testId="stat-makers" label="Makers running" value={statsReady ? fmtNum((desks || []).filter((d) => d.status === "running").length) : "—"} sub={statsReady ? `${fmtNum((desks || []).length)} launched or added` : ""} />
          <Stat testId="stat-wallets" label="Trading wallets" value={statsReady ? fmtNum(sum((d) => d.walletCount || 0)) : "—"} sub="every one public" />
          <Stat testId="stat-volume" label="Volume traded" value={statsReady ? fmtSol(String(sumSol((d) => d.totals?.volumeLamports) * 1e9), 1) : "—"} />
          <Stat testId="stat-claimed" label="Rewards claimed" value={statsReady ? fmtSol(String(sumSol((d) => d.totals?.claimedLamports) * 1e9), 1) : "—"} />
          <Stat testId="stat-realized" label="Realized P&L" value={statsReady ? fmtSolSigned(String(sumSol((d) => d.totals?.realizedLamports) * 1e9), 3) : "—"} />
          <Stat testId="stat-paidout" label="Paid to owners" value={statsReady ? fmtSol(String(sumSol((d) => d.totals?.paidOutLamports) * 1e9), 2) : "—"} />
          <Stat testId="stat-trades24" label="Trades 24h" value={statsReady ? fmtNum(sum((d) => d.totals?.trades24h || 0)) : "—"} sub="finalized on chain" />
        </StatRow>
      </section>

      {/* LIVE MAKERS — this site's coins only */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8 mt-16" data-testid="home-makers">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-white">
            Market makers <em className="font-serif italic text-[#8AF5D0]">live now.</em>
          </h2>
          <Link to="/explore" className="font-mono text-xs uppercase tracking-wider text-[#8ca3b8] hover:text-[#8AF5D0]" data-testid="home-explore-link">
            Explore all →
          </Link>
        </div>
        {statsReady && !desks.length && (
          <Panel className="px-6 py-14 text-center" data-testid="home-makers-empty">
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#8AF5D0]">No coins from this site yet</div>
            <p className="mx-auto mt-3 max-w-md text-[13px] font-light leading-relaxed text-[#8ca3b8]">
              This board only lists coins launched through this site or makers added through this site. Be the first — it shows up here the moment it lands on chain.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/launch" className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-5 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="makers-empty-launch-btn">
                <Rocket size={14} /> Launch a coin
              </Link>
              <Link to="/mm" className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-white/15 px-5 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0]" data-testid="makers-empty-mm-btn">
                <Plus size={14} /> Add a maker
              </Link>
            </div>
          </Panel>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {!statsReady && <Loading label="Loading makers" />}
          {desks?.map((d) => (
            <Link key={d.id} to={`/desk/${d.id}`} data-testid={`home-desk-${d.ticker}`}>
              <Panel className="group h-full p-5 hover:border-[#8AF5D0]/30 hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3">
                  <CoinAvatar url={d.imageUrl} name={d.name} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-white group-hover:text-[#8AF5D0] transition-colors">{d.name}</div>
                    <div className="font-mono text-[11px] text-[#556b82]">${d.ticker}</div>
                  </div>
                  <span className={`ml-auto h-1.5 w-1.5 rounded-[3px] ${d.status === "running" ? "bg-[#38c973] pip-blink" : "bg-[#556b82]"}`} />
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
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#8AF5D0]">The journey of every SOL</div>
        <h2 className="max-w-xl text-2xl md:text-4xl font-medium tracking-tight text-white">
          One signature wires the <em className="font-serif italic text-[#8AF5D0]">whole maker.</em>
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-light text-[#8ca3b8]">
          From then on the vault collects fees, feeds the trading wallets and settles up with you — on its own.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Your wallet", "Approves the launch. SOL only ever flows out to you — plus a fixed 20% profit cut that gets torched forever.", "YOU"],
            ["The maker's vault", "Holds the market maker's capital and your pending payouts. Claims the coin's fees by itself.", "VAULT"],
            ["Trading wallets", "One to ten of them, each running its own book and price lines. All public, all on-chain.", "WALLETS"],
            ["The coin's market", "Buys below its reference lines, sells above entry. Bonding curve first, then its liquidity pool.", "THE CURVE"],
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
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#8AF5D0]">Temperament</div>
          <h2 className="text-2xl md:text-4xl font-medium tracking-tight text-white">
            Pick a temperament. <em className="font-serif italic text-[#8AF5D0]">Retune it anytime.</em>
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
            Ship your coin with a <em className="font-serif italic text-[#8AF5D0]">market maker</em> built in.
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-sm font-light text-[#8ca3b8]">
            One approval from your wallet mints the coin, locks its fee split and funds the maker. Every dial remains yours after that.
          </p>
          <div className="relative mt-8 flex justify-center gap-3">
            <Link to="/launch" data-testid="cta-launch-btn"
              className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_24px_rgba(138,245,208,0.4)] transition-all">
              <Rocket size={15} /> Launch a coin
            </Link>
            <Link to="/docs" className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-white/15 px-6 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors" data-testid="cta-docs-btn">
              Read the docs
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}
