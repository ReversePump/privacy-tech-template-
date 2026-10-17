import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ArrowUpDown } from "lucide-react";
import { makers } from "../lib/api";
import { fmtSol, fmtSolSigned, fmtUsd, fmtNum, fmtAge, lamportsToSol } from "../lib/format";
import { PageHead, Panel, CoinCell, StatusDot, TypeBadge, Loading, Empty } from "../components/bits";

const FILTERS = [
  ["all", "All"],
  ["launch", "Launched here"],
  ["mm", "Any coin"],
  ["native", "Native"],
  ["paired", "Paired"],
  ["burn", "Half burns"],
];

const SORTS = [
  ["volume", "Volume"],
  ["mcap", "Mcap"],
  ["trades", "Trades"],
  ["age", "Age"],
  ["claimed", "Claimed"],
];

const matchFilter = (d, f) => {
  if (f === "all") return true;
  if (f === "launch") return d.origin === "launch";
  if (f === "mm") return d.origin === "mm" || d.origin === "external";
  if (f === "native") return d.origin === "native";
  if (f === "paired") return !!d.quoteMint;
  if (f === "burn") return !!d.burnSplit;
  return true;
};

const sortVal = (d, s) => {
  if (s === "volume") return lamportsToSol(d.totals?.volumeLamports) ?? 0;
  if (s === "mcap") return d.market?.mcapUsd ?? 0;
  if (s === "trades") return d.totals?.trades24h ?? 0;
  if (s === "age") return -Date.parse(d.launchedAt || d.createdAt || 0);
  if (s === "claimed") return lamportsToSol(d.totals?.claimedLamports) ?? 0;
  return 0;
};

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [desks, setDesks] = useState(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("volume");

  useEffect(() => {
    makers.desks().then((d) => setDesks(d.desks || [])).catch(() => setDesks([]));
  }, []);

  useEffect(() => { setQ(params.get("q") || ""); }, [params]);

  const rows = useMemo(() => {
    if (!desks) return null;
    const needle = q.trim().toLowerCase();
    return desks
      .filter((d) => matchFilter(d, filter))
      .filter((d) => !needle || d.name?.toLowerCase().includes(needle) || d.ticker?.toLowerCase().includes(needle) || d.mint?.toLowerCase().startsWith(needle))
      .sort((a, b) => sortVal(b, sort) - sortVal(a, sort));
  }, [desks, q, filter, sort]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="explore-page">
      <PageHead
        kicker="Explore"
        title="Every maker,"
        accent="every coin."
        sub="Open one to see its wallets, every trade and claim, and the settings it runs on. Or see which strategies work and copy one."
      />

      <Panel className="overflow-hidden" data-testid="explore-table-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#556b82]" />
            <input
              data-testid="explore-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Name, ticker, mint, or "paired"'
              className="h-9 w-64 rounded-[3px] border border-white/10 bg-white/5 pl-9 pr-3 text-[13px] text-white placeholder-[#556b82] outline-none focus:border-[#8AF5D0]/40"
            />
          </div>
          <div className="flex flex-wrap gap-1" data-testid="explore-filters">
            {FILTERS.map(([k, l]) => (
              <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)}
                className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${filter === k ? "bg-[#8AF5D0] text-[#07111f]" : "text-[#8ca3b8] hover:bg-white/5"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown size={12} className="text-[#556b82]" />
            <select data-testid="explore-sort" value={sort} onChange={(e) => setSort(e.target.value)}
              className="h-9 rounded-[3px] border border-white/10 bg-white/5 px-3 font-mono text-[11px] uppercase text-[#8ca3b8] outline-none">
              {SORTS.map(([k, l]) => <option key={k} value={k} className="bg-[#0d1b2a]">{l}</option>)}
            </select>
          </div>
        </div>

        {!rows && <Loading label="Loading makers" />}
        {rows && rows.length === 0 && <Empty>No makers match.</Empty>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="explore-table">
              <thead>
                <tr>
                  <th>Coin</th><th>Status</th><th>Type</th><th className="text-right">Mcap</th>
                  <th className="text-right">Capital</th><th className="text-right">Realized P&L</th>
                  <th className="text-right">Claimed</th><th className="text-right">Volume</th>
                  <th className="text-right">Trades 24h</th><th className="text-right">Wallets</th><th className="text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const realized = lamportsToSol(d.totals?.realizedLamports);
                  return (
                    <tr key={d.id} data-testid={`desk-row-${d.ticker}-${d.id.slice(0, 6)}`}>
                      <td><CoinCell imageUrl={d.imageUrl} name={d.name} ticker={d.ticker} id={d.id} /></td>
                      <td><StatusDot status={d.status} /></td>
                      <td><TypeBadge desk={d} /></td>
                      <td className="text-right font-mono text-white tnum">{fmtUsd(d.market?.mcapUsd)}</td>
                      <td className="text-right font-mono text-[#8ca3b8] tnum">{fmtSol(d.totals?.capitalLamports, 2)}</td>
                      <td className={`text-right font-mono tnum ${realized > 0 ? "text-[#38c973]" : realized < 0 ? "text-[#ff4d4f]" : "text-[#8ca3b8]"}`}>
                        {d.totals?.realizedLamports != null ? fmtSolSigned(d.totals.realizedLamports, 3) : "—"}
                      </td>
                      <td className="text-right font-mono text-[#8ca3b8] tnum">{d.origin === "mm" || d.origin === "external" ? "no rewards" : fmtSol(d.totals?.claimedLamports, 2)}</td>
                      <td className="text-right font-mono text-white tnum">{fmtSol(d.totals?.volumeLamports, 1)}</td>
                      <td className="text-right font-mono text-[#8ca3b8] tnum">{fmtNum(d.totals?.trades24h)}</td>
                      <td className="text-right font-mono text-[#8ca3b8] tnum">{d.walletCount ?? "—"}</td>
                      <td className="text-right font-mono text-[#8ca3b8] tnum">{fmtAge(d.launchedAt || d.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
