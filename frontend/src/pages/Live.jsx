import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { makers } from "../lib/api";
import { fmtSol, fmtNum, fmtAge, lamportsToSol, short, solscanTx } from "../lib/format";
import { PageHead, Panel, Stat, StatRow, KindPill, CoinAvatar, Loading, Empty, ExtLink } from "../components/bits";

const KINDS = [
  ["", "All"],
  ["trade", "Trades"],
  ["claim", "Claims"],
  ["payout", "Payouts"],
  ["launch", "Launches"],
];

export default function Live() {
  const [ourDesks, setOurDesks] = useState(null);
  const [globalDesks, setGlobalDesks] = useState(null);
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState("");

  const ourApi = `${process.env.REACT_APP_BACKEND_URL}/api/our/desks`;

  useEffect(() => {
    fetch(ourApi).then((r) => r.json()).then((d) => setOurDesks(d.desks || [])).catch(() => setOurDesks([]));
  }, []);

  useEffect(() => {
    if (!ourDesks) return;
    if (!ourDesks.length) { setGlobalDesks([]); return; }
    Promise.all(ourDesks.map((d) => makers.desk(d.deskId).catch(() => null)))
      .then((arr) => setGlobalDesks(arr.filter(Boolean)))
      .catch(() => setGlobalDesks([]));
  }, [ourDesks]);

  const ourIds = new Set((ourDesks || []).map((d) => d.deskId));
  const ours = globalDesks || [];
  const sum = (arr, fn) => arr.reduce((a, d) => a + (fn(d) || 0), 0);

  useEffect(() => {
    if (!ourDesks) return;
    let live = true;
    setItems(null);
    const load = () =>
      makers.feed(100, kind || undefined)
        .then((d) => live && setItems((d.items || []).filter((it) => ourIds.has(it.deskId))))
        .catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ourDesks]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="live-page">
      <PageHead
        kicker="Live"
        title="Live maker"
        accent="activity."
        sub="Only coins launched through this site and makers added through this site — every buy, sell, reward claim and launch, the moment it finalizes on chain."
      />

      <StatRow className="mb-8" >
        <Stat testId="live-stat-makers" label="Makers running" value={ourDesks ? fmtNum(ours.filter((d) => d.status === "running").length) : "—"} sub="launched or added here" />
        <Stat testId="live-stat-launched" label="Coins launched here" value={ourDesks ? fmtNum(ourDesks.filter((d) => d.origin === "launch").length) : "—"} sub="created through this site" />
        <Stat testId="live-stat-added" label="Makers added here" value={ourDesks ? fmtNum(ourDesks.filter((d) => d.origin === "mm").length) : "—"} sub="put on existing coins" />
        <Stat testId="live-stat-wallets" label="Trading wallets" value={globalDesks ? fmtNum(sum(ours, (d) => d.walletCount || 0)) : "—"} sub="every one public" />
        <Stat testId="live-stat-volume" label="Volume traded" value={globalDesks ? fmtSol(String(sum(ours, (d) => lamportsToSol(d.totals?.volumeLamports) || 0) * 1e9), 1) : "—"} />
        <Stat testId="live-stat-trades" label="Trades 24h" value={globalDesks ? fmtNum(sum(ours, (d) => d.totals?.trades24h || 0)) : "—"} sub="finalized on chain" />
      </StatRow>

      <Panel className="overflow-hidden" data-testid="activity-panel">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="text-white font-medium">Activity</span>
          <div className="flex gap-1" data-testid="activity-filters">
            {KINDS.map(([k, l]) => (
              <button key={k || "all"} data-testid={`activity-filter-${k || "all"}`} onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${kind === k ? "bg-[#8AF5D0] text-[#07111f]" : "text-[#8ca3b8] hover:bg-white/5"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {!items && <Loading label="Listening" />}
        {items && items.length === 0 && <Empty>Nothing yet — the first coin launched or maker added through this site will show up here the moment it lands on chain.</Empty>}
        {items && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="activity-table">
              <thead>
                <tr><th>Kind</th><th>Maker</th><th className="text-right">SOL</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.signature || i} className="animate-[feedin_0.3s_ease]">
                    <td><KindPill kind={it.kind} /></td>
                    <td>
                      <Link to={it.deskId ? `/desk/${it.deskId}` : "#"} className="flex items-center gap-2 group">
                        <CoinAvatar url={it.imageUrl} name={it.ticker} size={20} className="rounded" />
                        <span className="font-mono text-xs text-white group-hover:text-[#8AF5D0]">${it.ticker}</span>
                      </Link>
                    </td>
                    <td className="text-right font-mono text-white tnum">
                      {it.lamports != null ? lamportsToSol(it.lamports)?.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
                    </td>
                    <td className="text-right">
                      {it.signature ? <ExtLink href={solscanTx(it.signature)} className="font-mono text-[11px]">{short(it.signature, 4, 4)}</ExtLink> : "—"}
                    </td>
                    <td className="text-right font-mono text-[11px] text-[#556b82]">{fmtAge(it.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <style>{`@keyframes feedin { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
