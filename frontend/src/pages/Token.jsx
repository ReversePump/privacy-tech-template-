import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import { makers } from "../lib/api";
import { fmtSol, fmtUsd, fmtNum, short, pumpCoin, dexscreener, solscanAcct } from "../lib/format";
import { Panel, Stat, CoinAvatar, SubPrice, StatusDot, Loading, ExtLink } from "../components/bits";

export function DeskChart({ deskId, height = 300 }) {
  const [range, setRange] = useState("24h");
  const [mode, setMode] = useState("price");
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    makers.chart(deskId, range)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ points: [], trades: [], claims: [] }));
    return () => { live = false; };
  }, [deskId, range]);

  const points = (data?.points || []).map((p) => ({
    t: Date.parse(p.at || p.t || p.time),
    price: p.priceSol ?? p.price ?? p.close ?? null,
    mcap: p.mcapUsd ?? p.mcap ?? null,
  })).filter((p) => p.t && (mode === "price" ? p.price != null : p.mcap != null));

  return (
    <div data-testid="desk-chart">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex gap-1">
          {[["price", "Price"], ["mcap", "Mcap"]].map(([k, l]) => (
            <button key={k} data-testid={`chart-mode-${k}`} onClick={() => setMode(k)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase ${mode === k ? "bg-[#8AF5D0] text-[#07111f]" : "text-[#8ca3b8] hover:bg-white/5"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["1h", "6h", "24h", "7d"].map((r) => (
            <button key={r} data-testid={`chart-range-${r}`} onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase ${range === r ? "bg-white/10 text-white" : "text-[#556b82] hover:text-white"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height }} className="px-2 pb-2 pt-2">
        {!data && <Loading label="Loading chart" />}
        {data && points.length === 0 && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[#556b82]">
            Not enough price history for this range yet. The maker records the price once a minute.
          </div>
        )}
        {data && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="mintfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8AF5D0" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#8AF5D0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                stroke="#33465c" fontSize={10} tickLine={false} axisLine={false} minTickGap={60} />
              <YAxis orientation="right" domain={["auto", "auto"]} stroke="#33465c" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v) => (v >= 1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(5) : v.toExponential(1))} width={64} />
              <Tooltip
                contentStyle={{ background: "#0d1b2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }}
                labelStyle={{ color: "#8ca3b8" }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(v) => [mode === "price" ? `${Number(v).toPrecision(6)} SOL` : fmtUsd(v), mode]}
              />
              <Area type="monotone" dataKey={mode === "price" ? "price" : "mcap"} stroke="#8AF5D0" strokeWidth={1.5} fill="url(#mintfill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#556b82]">
        <span className="flex items-center gap-1.5"><span className="text-[#38c973]">▲</span> Maker buy</span>
        <span className="flex items-center gap-1.5"><span className="text-[#ff4d4f]">▼</span> Maker sell</span>
        <span className="flex items-center gap-1.5"><span className="text-[#8AF5D0]">◆</span> Rewards claimed</span>
      </div>
    </div>
  );
}

export default function Token() {
  const [native, setNative] = useState(null);
  const [burns, setBurns] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    makers.native().then(setNative).catch(() => {});
    makers.burns().then(setBurns).catch(() => {});
  }, []);

  if (!native) return <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-14"><Loading label="Loading $MAKERS" /></div>;

  const t = native.totals || {};
  const m = native.market || {};

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="token-page">
      <div className="flex flex-wrap items-start gap-5">
        <CoinAvatar url={native.imageUrl} name={native.name} size={64} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8AF5D0]">Platform token</div>
          <h1 className="mt-1 text-4xl md:text-5xl font-medium tracking-tight text-white">
            $MAKERS <span className="text-xl text-[#556b82] font-light">makers.fun</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs text-[#8ca3b8]">
            <StatusDot status={native.status} />
            <span>its own maker · {native.walletCount} wallets</span>
            <button
              data-testid="copy-mint-btn"
              onClick={() => { navigator.clipboard?.writeText(native.mint); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors">
              {copied ? <Check size={11} /> : <Copy size={11} />} {short(native.mint, 4, 4)}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExtLink href={pumpCoin(native.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs" data-testid="token-pump-link">pump.fun</ExtLink>
          <ExtLink href={dexscreener(native.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs" data-testid="token-dex-link">DexScreener</ExtLink>
          <ExtLink href={solscanAcct(native.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs" data-testid="token-solscan-link">Solscan</ExtLink>
          <Link to={`/desk/${native.id}`} className="rounded-full bg-[#8AF5D0] px-4 py-2 text-xs font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="token-maker-page-btn">
            Full maker page
          </Link>
        </div>
      </div>

      <p className="mt-6 max-w-3xl text-sm font-light leading-relaxed text-[#8ca3b8]">
        $MAKERS market-makes with its own creator rewards, through the same engine and under the same rules as every coin here. Its market wallet signs every claim itself, so each one is on its chart.
      </p>

      <Panel className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-white/5 overflow-hidden" data-testid="token-stats">
        <Stat label="Price" value={<SubPrice value={m.priceSol} />} sub={fmtUsd(m.mcapUsd && m.priceSol ? null : null)} testId="token-price" />
        <Stat label="Market cap" value={fmtUsd(m.mcapUsd)} sub={m.mcapSol ? `${fmtNum(m.mcapSol, 1)} SOL` : ""} testId="token-mcap" />
        <Stat label="Capital" value={fmtSol(t.capitalLamports, 1)} testId="token-capital" />
        <Stat label="Realized P&L" value={fmtSol(t.realizedLamports, 2)} testId="token-realized" />
        <Stat label="Claimed" value={fmtSol(t.claimedLamports, 1)} testId="token-claimed" />
        <Stat label="Paid out" value={fmtSol(t.paidOutLamports, 2)} testId="token-paidout" />
        <Stat label="Volume" value={fmtSol(t.volumeLamports, 1)} testId="token-volume" />
        <Stat label="Trades 24h" value={fmtNum(t.trades24h)} testId="token-trades" />
        <Stat label="$MAKERS burned" value={burns ? fmtNum(Number(burns.burnedQuote) / 1e6, 0) : "—"} testId="token-burned" />
        <Stat label="Paired coins" value={burns ? fmtNum(burns.pairedCoins) : "—"} testId="token-paired" />
      </Panel>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2 overflow-hidden">
          <DeskChart deskId={native.id} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel className="p-5" data-testid="token-rewards-panel">
            <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#8AF5D0]">Where its rewards go</div>
            <ol className="mt-4 space-y-4">
              <li>
                <div className="flex items-baseline justify-between">
                  <span className="text-white text-sm font-medium">01 · Creator fees</span>
                  <span className="font-mono text-xs text-[#8AF5D0]">{fmtSol(t.claimedLamports, 1)} claimed</span>
                </div>
                <p className="mt-1 text-[12px] font-light text-[#8ca3b8]">Every $MAKERS trade pays pump.fun's creator fee into the coin's fee split.</p>
              </li>
              <li>
                <div className="flex items-baseline justify-between">
                  <span className="text-white text-sm font-medium">02 · Fee split</span>
                  <span className="font-mono text-xs text-[#8AF5D0]">80% to the market wallet</span>
                </div>
                <p className="mt-1 text-[12px] font-light text-[#8ca3b8]">The split pays the market wallet 80%; the rest goes to its other shareholders in the same payout.</p>
              </li>
              <li>
                <div className="flex items-baseline justify-between">
                  <span className="text-white text-sm font-medium">03 · Profit fee</span>
                  <span className="font-mono text-xs text-[#8AF5D0]">20% buys back & burns</span>
                </div>
                <p className="mt-1 text-[12px] font-light text-[#8ca3b8]">20% of realized profit across every maker buys $MAKERS and burns it.</p>
              </li>
            </ol>
          </Panel>
          <Panel className="p-5" data-testid="token-burn-panel">
            <div className="text-white text-sm font-medium">Every burn</div>
            <p className="mt-1.5 text-[12px] font-light text-[#8ca3b8]">
              {burns ? `${fmtNum(Number(burns.burnedQuote) / 1e6, 0)} $MAKERS burned so far, out of ${fmtNum(Number(burns.supplyQuote) / 1e6, 0)} supply.` : "Loading burns…"}
            </p>
            <Link to="/burn" className="mt-4 inline-flex h-9 items-center rounded-full border border-[#8AF5D0]/30 px-4 text-xs font-mono uppercase tracking-wide text-[#8AF5D0] hover:bg-[#8AF5D0]/10" data-testid="token-burn-link">
              Burn history →
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
