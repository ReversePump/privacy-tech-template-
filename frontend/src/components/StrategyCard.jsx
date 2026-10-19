import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Panel, Tag, CoinIcon } from "./bits";

const VENUE_LABEL = { hyperliquid: "Hyperliquid", solana: "Solana", jupiter: "Jupiter", meteora: "Meteora", papertrade: "Papertrade" };

export default function StrategyCard({ entry, testId }) {
  const s = entry.strategy || entry;
  const venues = [...new Set((s.actions || []).map((a) => a.instrument?.venue).filter(Boolean))];
  const symbols = [...new Set((s.actions || []).map((a) => a.instrument?.symbol).filter(Boolean))];
  const side = (s.actions || [])[0]?.side;
  return (
    <Link to={`/strategies/${s.id}`} data-testid={testId || `strategy-card-${s.id}`}>
      <Panel className="group h-full p-5 hover:border-[#a855f73d] hover:-translate-y-0.5 transition-all">
        <div className="flex items-center gap-2">
          {symbols.slice(0, 3).map((sym) => <CoinIcon key={sym} symbol={sym} size={22} />)}
          {side && <Tag tone={side === "short" ? "short" : "long"}>{side}</Tag>}
        </div>
        <h3 className="mt-3 serif text-lg font-medium text-[#f3f0fd] group-hover:text-[#c084fc] transition-colors">{s.name}</h3>
        {s.thesis && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#a89ec4] line-clamp-2">{s.thesis}</p>}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {venues.map((v) => <Tag key={v}>{VENUE_LABEL[v] || v}</Tag>)}
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] text-[#a855f7] opacity-0 group-hover:opacity-100 transition-opacity">
            Open <ArrowRight size={12} />
          </span>
        </div>
      </Panel>
    </Link>
  );
}
