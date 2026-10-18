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

const MASK_IMG = "/coin-mask.png";
const API = process.env.REACT_APP_BACKEND_URL;

export default function Live() {
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState("");
  const [oursRec, setOursRec] = useState({ desks: [], launches: [] });

  useEffect(() => {
    const load = () =>
      Promise.all([
        fetch(`${API}/api/our/desks`).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/api/our/launches`).then((r) => r.json()).catch(() => ({})),
      ]).then(([d, l]) => setOursRec({ desks: d.desks || [], launches: l.launches || [] }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let live = true;
    setItems(null);
    const load = () =>
      makers.feed(100, kind || undefined)
        .then((d) => {
          if (!live) return;
          const upstream = (d.items || []).filter((it) => !feedItemBlocked(it));
          const ourDeskIds = new Set(oursRec.desks.map((dk) => dk.deskId));
          upstream.forEach((it) => { if (it.deskId && ourDeskIds.has(it.deskId)) it.ours = true; });
          const synth = [];
          if (!kind || kind === "launch") {
            oursRec.launches.forEach((l) =>
              synth.push({ kind: "launch", mint: l.mint, ticker: l.ticker, name: l.name, imageUrl: l.imageUrl, at: l.createdAt, ours: true })
            );
            oursRec.desks.forEach((dk) =>
              synth.push({ kind: "onboard", mint: dk.mint, ticker: dk.ticker, name: dk.name, imageUrl: dk.imageUrl, at: dk.createdAt, deskId: dk.deskId, ours: true })
            );
          }
          const upLaunchMints = new Set(upstream.filter((i) => i.kind === "launch" && i.mint).map((i) => i.mint));
          const merged = [...upstream, ...synth.filter((s) => !s.mint || !upLaunchMints.has(s.mint))]
            .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
          setItems(merged);
        })
        .catch(() => live && setItems([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, oursRec]);

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
                  const al = it.ours ? null : aliasFor(it.mint, it.ticker);
                  const shownTicker = it.ours ? (it.ticker || aliasFor(it.mint).ticker) : al.ticker;
                  const shownImg = it.ours ? it.imageUrl : MASK_IMG;
                  return (
                  <tr key={it.signature || `${it.ours ? "ours" : "up"}-${it.mint || i}-${i}`} className="animate-[feedin_0.3s_ease]">
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <KindPill kind={it.kind} />
                        {it.ours && <span className="rounded-[3px] bg-[#3F9E00]/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#3F9E00]" data-testid="feed-here-chip">here</span>}
                      </span>
                    </td>
                    <td>
                      <Link to={it.deskId ? `/desk/${it.deskId}` : "#"} className="flex items-center gap-2 group">
                        <CoinAvatar url={shownImg} name={it.ours ? it.name || shownTicker : al.name} size={20} className="rounded" />
                        <span className="font-mono text-xs text-[#131a0f] group-hover:text-[#3F9E00]">${shownTicker}</span>
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
