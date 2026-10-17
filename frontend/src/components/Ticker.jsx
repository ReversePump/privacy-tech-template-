import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { makers } from "../lib/api";
import { fmtSol, lamportsToSol } from "../lib/format";

const KIND_MARK = {
  buy: ["▼", "#38c973", "BUY"],
  sell: ["▲", "#ff4d4f", "SELL"],
  claim: ["◆", "#8AF5D0", "CLAIM"],
  payout: ["⭱", "#c8a24a", "PAYOUT"],
  launch: ["✦", "#ffffff", "LAUNCH"],
};

export default function Ticker() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let live = true;
    const load = () =>
      makers.feed(24).then((d) => live && setItems(d.items || [])).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (!items.length) return null;

  const row = (it, i) => {
    const [icon, color, label] = KIND_MARK[it.kind] || ["•", "#8ca3b8", it.kind?.toUpperCase()];
    return (
      <Link
        key={`${it.signature || i}-${i}`}
        to={it.deskId ? `/desk/${it.deskId}` : "/live"}
        className="mx-4 flex items-center gap-2 font-mono text-[11px] text-[#8ca3b8] hover:text-white transition-colors whitespace-nowrap"
      >
        <span style={{ color }}>{icon}</span>
        <span style={{ color }}>{label}</span>
        <span className="text-white">${it.ticker}</span>
        {it.lamports != null && (
          <span>{lamportsToSol(it.lamports)?.toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL</span>
        )}
      </Link>
    );
  };

  return (
    <div className="relative overflow-hidden border-b border-white/5 bg-[#0a1626]/60 py-2" data-testid="live-ticker">
      <div className="ticker-track">
        <div className="flex">{items.map(row)}</div>
        <div className="flex" aria-hidden>{items.map((it, i) => row(it, i + items.length))}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#07111f] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#07111f] to-transparent" />
    </div>
  );
}
