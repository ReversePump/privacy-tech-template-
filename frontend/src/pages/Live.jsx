import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { makers } from "../lib/api";
import { fmtAge, lamportsToSol, short, solscanTx } from "../lib/format";
import { PageHead, Panel, KindPill, CoinAvatar, Loading, Empty, ExtLink } from "../components/bits";
import { feedItemBlocked } from "../lib/useOurDesks";
import { aliasFor } from "../lib/alias";

const KINDS = [
  ["", "All"],
  ["trade", "Trades"],
  ["claim", "Claims"],
  ["payout", "Payouts"],
  ["launch", "Launches"],
];

export default function Live() {
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState("");

  useEffect(() => {
    let live = true;
    setItems(null);
    const load = () =>
      makers.feed(100, kind || undefined)
        .then((d) => live && setItems((d.items || []).filter((it) => !feedItemBlocked(it))))
        .catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="live-page">
      <PageHead
        kicker="The wire"
        title="Every fill,"
        accent="as it settles."
        sub="Every buy, sell, fee claim and payout across the engine — the second it lands on chain."
      />

      <Panel className="overflow-hidden" data-testid="activity-panel">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <span className="text-[#131a0f] font-medium">Activity</span>
          <div className="flex gap-1" data-testid="activity-filters">
            {KINDS.map(([k, l]) => (
              <button key={k || "all"} data-testid={`activity-filter-${k || "all"}`} onClick={() => setKind(k)}
                className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${kind === k ? "bg-[#3F9E00] text-[#131a0f]" : "text-[#5c6b50] hover:bg-black/5"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {!items && <Loading label="Listening" />}
        {items && items.length === 0 && <Empty>The wire is quiet for this filter right now — it fills the moment a matching operation lands on chain.</Empty>}
        {items && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="activity-table">
              <thead>
                <tr><th>Kind</th><th>Maker</th><th className="text-right">SOL</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const al = aliasFor(it.mint, it.ticker);
                  return (
                  <tr key={it.signature || i} className="animate-[feedin_0.3s_ease]">
                    <td><KindPill kind={it.kind} /></td>
                    <td>
                      <Link to={it.deskId ? `/desk/${it.deskId}` : "#"} className="flex items-center gap-2 group">
                        <CoinAvatar url={it.imageUrl} name={al.name} size={20} className="rounded" />
                        <span className="font-mono text-xs text-[#131a0f] group-hover:text-[#3F9E00]">${al.ticker}</span>
                      </Link>
                    </td>
                    <td className="text-right font-mono text-[#131a0f] tnum">
                      {it.lamports != null ? lamportsToSol(it.lamports)?.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
                    </td>
                    <td className="text-right">
                      {it.signature ? <ExtLink href={solscanTx(it.signature)} className="font-mono text-[11px]">{short(it.signature, 4, 4)}</ExtLink> : "—"}
                    </td>
                    <td className="text-right font-mono text-[11px] text-[#93a184]">{fmtAge(it.at)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <style>{`@keyframes feedin { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
