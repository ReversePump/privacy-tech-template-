import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, Check, ShieldCheck, Droplets, Activity } from "lucide-react";
import Seo from "../components/Seo";
import { Panel, Loading } from "../components/bits";
import { LOOM_CA, LOOM_X } from "../lib/brand";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtPrice = (p) => (p == null ? "—" : p < 0.0001 ? `$${p.toExponential(2)}` : p < 0.01 ? `$${p.toPrecision(3)}` : `$${p.toLocaleString("en-US", { maximumFractionDigits: 4 })}`);
const fmtBig = (v) => (v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${Number(v).toFixed(0)}`);

function PriceChart({ candles }) {
  const W = 1000, H = 280, PAD = 8;
  const closes = candles.map((c) => c[1]);
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || min * 0.01 || 1;
  const up = closes[closes.length - 1] >= closes[0];
  const line = up ? "#34d399" : "#f43f5e";
  const pts = closes.map((c, i) => [
    PAD + (i / (closes.length - 1)) * (W - 2 * PAD),
    H - PAD - ((c - min) / span) * (H - 2 * PAD),
  ]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const gid = `g${up ? "up" : "dn"}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[280px] w-full" preserveAspectRatio="none" data-testid="token-chart">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={line} stopOpacity="0.25" />
          <stop offset="100%" stopColor={line} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="#ffffff14" strokeDasharray="3 6" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={line}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function Token() {
  const [t, setT] = useState(null);
  const [candles, setCandles] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = () => fetch(`${API}/api/loom/token`).then((r) => r.json()).then(setT).catch(() => {});
    const loadChart = () => fetch(`${API}/api/loom/chart`).then((r) => r.json()).then((d) => setCandles(d.candles || [])).catch(() => {});
    load(); loadChart();
    const iv = setInterval(load, 30000);
    const iv2 = setInterval(loadChart, 300000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(LOOM_CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const up = (t?.change24hPct ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="token-page">
      <Seo title="$LOOM Token · Loom" description="$LOOM — the Loom token on Solana. Live price, contract address, supply and how operating strategies earns the airdrop." path="/token" />

      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">The Loom token · Solana</div>
          <h1 className="mt-3 serif text-4xl md:text-6xl font-light tracking-tight">
            $LOOM <span className={`mono text-xl md:text-2xl align-middle ${t ? (up ? "text-[#34d399]" : "text-[#f43f5e]") : "text-[#9aa0ae]"}`} data-testid="token-price">{t?.priceUsd ? fmtPrice(t.priceUsd) : "—"}</span>
          </h1>
          <p className="mt-3 max-w-xl text-[14px] text-[#9aa0ae]">
            One contract, verified on this page and on X — nowhere else. Operate strategies on Loom and earn your share of the $LOOM airdrop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`https://solscan.io/token/${LOOM_CA}`} target="_blank" rel="noopener noreferrer" data-testid="token-solscan"
            className="inline-flex h-9 items-center rounded-full border border-[#ffffff26] px-4 text-[12px] text-[#9aa0ae] hover:text-[#f4f4f5] hover:border-[#ffffff59] transition-colors">Solscan ↗</a>
          <a href={t?.pairUrl || `https://dexscreener.com/solana/${LOOM_CA}`} target="_blank" rel="noopener noreferrer" data-testid="token-dexscreener"
            className="inline-flex h-9 items-center rounded-full border border-[#ffffff26] px-4 text-[12px] text-[#9aa0ae] hover:text-[#f4f4f5] hover:border-[#ffffff59] transition-colors">DexScreener ↗</a>
        </div>
      </div>

      {/* stat cards */}
      {!t ? <Loading /> : (
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="token-stats">
          {[
            ["Price", fmtPrice(t.priceUsd), `${up ? "+" : ""}${t.change24hPct ?? 0}% 24h`, up],
            ["Market cap", fmtBig(t.marketCapUsd), `${t.buys24h ?? "—"} buys · ${t.sells24h ?? "—"} sells 24h`, null],
            ["Volume 24h", fmtBig(t.volume24hUsd), t.dex ? `via ${t.dex}` : "", null],
            ["Liquidity", fmtBig(t.liquidityUsd), t.liquidityUsd ? "" : "on the bonding curve", null],
          ].map(([label, value, sub, good]) => (
            <Panel key={label} className="p-5">
              <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">{label}</div>
              <div className="mt-1.5 text-2xl font-medium tnum" data-testid={`token-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
              {sub ? <div className={`mt-1 text-[11px] ${good === null ? "text-[#9aa0ae]" : good ? "text-[#34d399]" : "text-[#f43f5e]"}`}>{sub}</div> : null}
            </Panel>
          ))}
        </div>
      )}

      {/* CA + facts */}
      <div className="mt-6 grid md:grid-cols-2 gap-3">
        <Panel className="p-6" data-testid="token-ca-card">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">Contract address</div>
          <code className="mt-3 block mono text-[12px] leading-relaxed text-[#f4f4f5] break-all" data-testid="token-ca">{LOOM_CA}</code>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={copy} data-testid="token-ca-copy"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e5e7eb] px-4 text-[12px] font-medium text-black hover:bg-[#f1f5f9] transition-colors">
              {copied ? <Check size={12} className="text-[#059669]" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy CA"}
            </button>
            <a href={LOOM_X} target="_blank" rel="noopener noreferrer" data-testid="token-x-link"
              className="inline-flex h-9 items-center rounded-full border border-[#ffffff26] px-4 text-[12px] text-[#9aa0ae] hover:text-[#f4f4f5] hover:border-[#ffffff59] transition-colors">@loomfiai on X ↗</a>
          </div>
          <p className="mt-4 text-[12px] text-[#6b7280]">Always verify the address here or on X before trading. Any other contract claiming to be Loom is fake.</p>
        </Panel>
        <Panel className="p-6" data-testid="token-facts-card">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">On-chain facts</div>
          <div className="mt-3 space-y-2.5 text-[13px]">
            {[
              [ShieldCheck, "Mint authority revoked", "supply can never increase"],
              [ShieldCheck, "Freeze authority revoked", "nobody can freeze your tokens"],
              [Droplets, `Supply ${(t?.supply ?? 1e9).toLocaleString("en-US")} LOOM`, "fully circulating, nothing locked"],
              [Activity, "Live on Solana mainnet", "every trade verifiable on chain"],
            ].map(([Icon, title, sub]) => (
              <div key={title} className="flex items-start gap-3">
                <Icon size={14} className="mt-0.5 text-[#9aa0ae]" />
                <div>
                  <div className="text-[#f4f4f5]">{title}</div>
                  <div className="text-[11px] text-[#9aa0ae]">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* chart */}
      <Panel className="mt-6 p-5 overflow-hidden" data-testid="token-chart-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">$LOOM · 15m · live on chain</span>
          {candles.length > 1 && (
            <span className="mono text-[11px] tnum text-[#9aa0ae]" data-testid="token-chart-last">
              {fmtPrice(candles[candles.length - 1][1])}
            </span>
          )}
        </div>
        {candles.length > 1 ? <PriceChart candles={candles} /> : (
          <div className="flex h-[280px] items-center justify-center text-[13px] text-[#9aa0ae]">Loading live chart…</div>
        )}
      </Panel>

      {/* airdrop */}
      <Panel className="mt-6 p-6 md:p-8" data-testid="token-airdrop-card">
        <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">Operate &amp; earn</div>
        <h2 className="mt-2 serif text-2xl md:text-3xl font-light tracking-tight">Every strategy you run counts toward your $LOOM airdrop.</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[#9aa0ae]">
          Draft a strategy, run it in practice or live, climb the board. Activity on Loom — deployments, fills, uptime —
          is what the airdrop measures. Allocation details and snapshot dates are announced on X first.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/new" data-testid="token-start-btn"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e5e7eb] px-5 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] transition-colors">
            Start operating <ArrowRight size={14} />
          </Link>
          <Link to="/strategies" data-testid="token-strategies-btn"
            className="inline-flex h-10 items-center rounded-full border border-[#ffffff26] px-5 text-[13px] text-[#9aa0ae] hover:text-[#f4f4f5] hover:border-[#ffffff59] transition-colors">
            Browse strategies
          </Link>
        </div>
      </Panel>
    </div>
  );
}
