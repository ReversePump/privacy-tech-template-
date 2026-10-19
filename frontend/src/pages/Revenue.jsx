import React, { useEffect, useState } from "react";
import Seo from "../components/Seo";
import { loom } from "../lib/api";
import { fmtUsd, fmtUsd0 } from "../lib/format";
import { Panel } from "../components/bits";

export default function Revenue() {
  const [rev, setRev] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => {
      loom.revenue().then(setRev).catch(() => {});
      loom.stats().then(setStats).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const total = rev?.totalUsd ?? null;

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="revenue-page">
      <Seo title="Revenue · Loom" description="Every platform fee, public and on chain — Hyperliquid builder earnings, Solana fee wallet and traded volume." path="/revenue" />
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Revenue</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#9aa0ae]">
        Every fee the platform earns — public and on chain, refreshed live.
      </p>

      <Panel className="mt-8 grid grid-cols-2 md:grid-cols-3 divide-x divide-[#ffffff26] overflow-hidden" data-testid="revenue-stats">
        {[
          ["Total earned", total != null ? fmtUsd(total) : "—", "all sources"],
          ["Volume traded", stats ? fmtUsd0(stats.volumeUsd) : "—", stats ? `${fmtNum0(stats.fills)} fills` : ""],
          ["Running deployments", stats ? fmtNum0(stats.running) : "—", "right now"],
        ].map(([l, v, s]) => (
          <div key={l} className="px-5 py-4">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">{l}</div>
            <div className="mt-1 text-xl font-medium tnum">{v}</div>
            {s && <div className="mt-0.5 text-[11px] text-[#9aa0ae]">{s}</div>}
          </div>
        ))}
      </Panel>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel className="p-5">
          <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Hyperliquid builder</div>
          <div className="mt-2 text-lg font-medium tnum">{rev ? fmtUsd(rev.hyperliquid?.earnedUsd) : "—"}</div>
          <p className="mt-1 text-[11px] text-[#9aa0ae]">earned on perps order flow</p>
        </Panel>
        <Panel className="p-5">
          <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Solana fee wallet</div>
          <div className="mt-2 text-lg font-medium tnum">{rev ? fmtUsd(rev.solana?.solUsd ?? 0 + (rev.solana?.usd ?? 0)) : "—"}</div>
          <p className="mt-1 text-[11px] text-[#9aa0ae]">swap fees, SOL + USDC</p>
        </Panel>
      </div>
    </div>
  );
}

const fmtNum0 = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));
