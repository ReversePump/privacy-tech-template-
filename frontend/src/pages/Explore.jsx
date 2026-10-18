import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowUpDown, Rocket, Plus, Zap } from "lucide-react";
import { fmtSol, fmtSolSigned, fmtUsd, fmtNum, fmtAge, lamportsToSol } from "../lib/format";
import { PageHead, Panel, CoinCell, StatusDot, TypeBadge, Loading, Empty, CoinAvatar } from "../components/bits";
import { useOurDesks, listBlocked, PLATFORM_MINT } from "../lib/useOurDesks";
import { makers } from "../lib/api";
import { maskCoin } from "../lib/alias";

const FILTERS = [
  ["all", "All"],
  ["launch", "Launched here"],
  ["mm", "Onboarded"],
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
  const [params] = useSearchParams();
  const { ourIds } = useOurDesks();
  const platformMint = PLATFORM_MINT;
  const [allDesks, setAllDesks] = useState(null);
  const [launches, setLaunches] = useState([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("volume");

  useEffect(() => {
    let live = true;
    const load = () => makers.desks({ limit: 100 }).then((d) => live && setAllDesks(d.desks || [])).catch(() => live && setAllDesks([]));
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/our/launches`)
      .then((r) => r.json())
      .then((d) => setLaunches(d.launches || []))
      .catch(() => {});
  }, []);

  const deskMints = new Set([...(allDesks || []).filter((d) => ourIds.has(d.id)).map((d) => d.mint)]);
  const awaiting = launches.filter((l) => !deskMints.has(l.mint));

  const rows = useMemo(() => {
    if (!allDesks) return null;
    const needle = q.trim().toLowerCase();
    return allDesks
      .filter((d) => !listBlocked(d))
      .filter((d) => (filter === "all" ? true : ourIds.has(d.id) && matchFilter(d, filter)))
      .filter((d) => {
        if (!needle) return true;
        const mk = maskCoin(d, ourIds.has(d.id), platformMint);
        return mk.name?.toLowerCase().includes(needle) || mk.ticker?.toLowerCase().includes(needle) || d.mint?.toLowerCase().startsWith(needle);
      })
      .sort((a, b) => (ourIds.has(b.id) ? 1 : 0) - (ourIds.has(a.id) ? 1 : 0) || sortVal(b, sort) - sortVal(a, sort));
  }, [allDesks, ourIds, platformMint, q, filter, sort]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="explore-page">
      <PageHead
        kicker="Explore"
        title="Every maker."
        accent="Every market."
        sub="Live markets running right now, plus every coin launched or onboarded through MakeMarkets. Open any row to inspect wallets, fills, fee claims and the dials it runs on."
      />

      {awaiting.length > 0 && (
        <Panel className="mb-6 overflow-hidden" data-testid="awaiting-panel">
          <div className="border-b border-black/5 px-4 py-3 flex items-center gap-2">
            <Zap size={14} className="text-[#3F9E00]" />
            <span className="text-[#131a0f] font-medium text-sm">Minted here — awaiting a market maker</span>
          </div>
          {awaiting.map((l) => (
            <div key={l.mint} className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0" data-testid={`awaiting-${l.ticker}`}>
              <CoinAvatar url={l.imageUrl} name={l.name} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[13px] text-[#131a0f]">{l.name}</div>
                <div className="font-mono text-[10px] text-[#93a184]">${l.ticker} · {fmtAge(l.createdAt)} ago</div>
              </div>
              <Link to={`/mm?mint=${l.mint}`} data-testid={`awaiting-add-${l.ticker}`}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-[#3F9E00] px-3.5 text-xs font-medium text-white hover:bg-[#54C400]">
                <Zap size={12} /> Add the maker
              </Link>
            </div>
          ))}
        </Panel>
      )}

      <Panel className="overflow-hidden" data-testid="explore-table-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#93a184]" />
            <input
              data-testid="explore-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, ticker or mint"
              className="h-9 w-64 rounded-[3px] border border-black/10 bg-black/5 pl-9 pr-3 text-[13px] text-[#131a0f] placeholder-[#93a184] outline-none focus:border-[#3F9E00]/40"
            />
          </div>
          <div className="flex flex-wrap gap-1" data-testid="explore-filters">
            {FILTERS.map(([k, l]) => (
              <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)}
                className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${filter === k ? "bg-[#3F9E00] text-[#131a0f]" : "text-[#5c6b50] hover:bg-black/5"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown size={12} className="text-[#93a184]" />
            <select data-testid="explore-sort" value={sort} onChange={(e) => setSort(e.target.value)}
              className="h-9 rounded-[3px] border border-black/10 bg-black/5 px-3 font-mono text-[11px] uppercase text-[#5c6b50] outline-none">
              {SORTS.map(([k, l]) => <option key={k} value={k} className="bg-white">{l}</option>)}
            </select>
          </div>
        </div>

        {!rows && <Loading label="Loading makers" />}
        {rows && rows.length === 0 && (
          <Empty>
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.15em] text-[#3F9E00]">Nothing matches</p>
            <p className="mx-auto mb-5 max-w-md text-[12px] font-light leading-relaxed">
              Try another search — or launch your own coin and watch it appear here the moment it lands on chain.
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/launch" className="inline-flex h-9 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-4 text-xs font-medium text-[#131a0f] hover:bg-[#54C400]" data-testid="explore-empty-launch">
                <Rocket size={13} /> Launch a coin
              </Link>
              <Link to="/mm" className="inline-flex h-9 items-center gap-2 rounded-[3px] border border-black/15 px-4 text-xs text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00]" data-testid="explore-empty-mm">
                <Plus size={13} /> Onboard a coin
              </Link>
            </div>
          </Empty>
        )}
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
                  const mk = maskCoin(d, ourIds.has(d.id), platformMint);
                  return (
                    <tr key={d.id} data-testid={`desk-row-${mk.ticker}-${d.id.slice(0, 6)}`}>
                      <td><CoinCell imageUrl={mk.imageUrl} name={mk.name} ticker={mk.ticker} id={d.id} /></td>
                      <td><StatusDot status={d.status} /></td>
                      <td><TypeBadge desk={d} /></td>
                      <td className="text-right font-mono text-[#131a0f] tnum">{fmtUsd(d.market?.mcapUsd)}</td>
                      <td className="text-right font-mono text-[#5c6b50] tnum">{fmtSol(d.totals?.capitalLamports, 2)}</td>
                      <td className={`text-right font-mono tnum ${realized > 0 ? "text-[#38c973]" : realized < 0 ? "text-[#ff4d4f]" : "text-[#5c6b50]"}`}>
                        {d.totals?.realizedLamports != null ? fmtSolSigned(d.totals.realizedLamports, 3) : "—"}
                      </td>
                      <td className="text-right font-mono text-[#5c6b50] tnum">{d.origin === "mm" || d.origin === "external" ? "no fees" : fmtSol(d.totals?.claimedLamports, 2)}</td>
                      <td className="text-right font-mono text-[#131a0f] tnum">{fmtSol(d.totals?.volumeLamports, 1)}</td>
                      <td className="text-right font-mono text-[#5c6b50] tnum">{fmtNum(d.totals?.trades24h)}</td>
                      <td className="text-right font-mono text-[#5c6b50] tnum">{d.walletCount ?? "—"}</td>
                      <td className="text-right font-mono text-[#5c6b50] tnum">{fmtAge(d.launchedAt || d.createdAt)}</td>
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
