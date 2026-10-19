import React, { useEffect, useState } from "react";
import { weft } from "../lib/api";
import { fmtUsd, fmtUsd0, fmtUsdSigned, fmtPctSigned, fmtAge } from "../lib/format";
import { Panel, Tag, Loading, Empty } from "../components/bits";

export default function Revenue() {
  const [rev, setRev] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => {
      weft.revenue().then(setRev).catch(() => {});
      weft.stats().then(setStats).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const total = rev?.totalUsd ?? null;
  const buybacks = rev?.buybacks || [];

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="revenue-page">
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Revenue</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#75777d]">
        Every fee, buyback, burn and reward — public and on chain. Half of every fee buys $WEFT; that goes to traders, creators and the burn.
      </p>

      <Panel className="mt-8 grid grid-cols-2 md:grid-cols-4 divide-x divide-[#12121414] overflow-hidden" data-testid="revenue-stats">
        {[
          ["Total earned", total != null ? fmtUsd(total) : "—", "all sources"],
          ["Buybacks ($WEFT)", rev ? fmtUsd(rev.buybackUsd ?? rev.token?.buybackUsd) : "—", "bought on the open market"],
          ["Token claims", rev ? fmtNum0(rev.token?.claims) : "—", rev ? `${fmtAge(rev.token?.lastClaimAt)} last` : ""],
          ["Volume traded", stats ? fmtUsd0(stats.volumeUsd) : "—", stats ? `${fmtNum0(stats.fills)} fills` : ""],
        ].map(([l, v, s]) => (
          <div key={l} className="px-5 py-4">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">{l}</div>
            <div className="mt-1 text-xl font-medium tnum">{v}</div>
            {s && <div className="mt-0.5 text-[11px] text-[#75777d]">{s}</div>}
          </div>
        ))}
      </Panel>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel className="p-5">
          <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Hyperliquid builder</div>
          <div className="mt-2 text-lg font-medium tnum">{rev ? fmtUsd(rev.hyperliquid?.earnedUsd) : "—"}</div>
          <p className="mt-1 text-[11px] text-[#75777d]">earned on perps order flow</p>
        </Panel>
        <Panel className="p-5">
          <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Solana fee wallet</div>
          <div className="mt-2 text-lg font-medium tnum">{rev ? fmtUsd(rev.solana?.solUsd ?? 0 + (rev.solana?.usd ?? 0)) : "—"}</div>
          <p className="mt-1 text-[11px] text-[#75777d]">swap fees, SOL + USDC</p>
        </Panel>
        <Panel className="p-5">
          <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">$WEFT token fees</div>
          <div className="mt-2 text-lg font-medium tnum">{rev ? fmtUsd(rev.token?.claimedUsd) : "—"}</div>
          <p className="mt-1 text-[11px] text-[#75777d]">claimed from the token's fee split</p>
        </Panel>
      </div>

      <Panel className="mt-6 overflow-hidden" data-testid="buybacks-panel">
        <div className="border-b border-[#12121414] px-5 py-4 flex items-baseline justify-between">
          <span className="text-[14px] font-medium">Buybacks</span>
          <span className="mono text-[10px] text-[#75777d]">small amounts, about every ten minutes</span>
        </div>
        {!rev && <Loading label="Loading buybacks" />}
        {rev && buybacks.length === 0 && <Empty>No buybacks recorded yet.</Empty>}
        {buybacks.length > 0 && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="dtable" data-testid="buybacks-table">
              <thead><tr><th>Amount</th><th className="text-right">SOL</th><th className="text-right">Value</th><th className="text-right">Burned</th><th className="text-right">Age</th></tr></thead>
              <tbody>
                {buybacks.map((b, i) => (
                  <tr key={b.signature || i}>
                    <td className="mono tnum">{b.amount ? `${Number(b.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })} $WEFT` : "—"}</td>
                    <td className="text-right mono tnum">{b.sol != null ? `${Number(b.sol).toFixed(3)}` : "—"}</td>
                    <td className="text-right mono tnum">{b.usd != null ? fmtUsd(b.usd) : "—"}</td>
                    <td className="text-right">{b.burned ? <Tag tone="amber">burned</Tag> : <Tag>held</Tag>}</td>
                    <td className="text-right mono text-[11px] text-[#75777d]">{fmtAge(b.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

const fmtNum0 = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));
