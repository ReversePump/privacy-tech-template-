import React from "react";
import { fmtDuration, fmtPct } from "../lib/format";
import { CoinIcon, Tag } from "./bits";

const OPS = {
  gt: "above", gte: "at or above", lt: "below", lte: "at or below",
  eq: "equals", neq: "not", crosses_above: "crosses above", crosses_below: "crosses below",
};

const KIND_LABEL = {
  price: "Price", funding: "Funding", social: "Posts on X", social_volume: "Buzz on X",
  news: "News", odds: "Prediction market", forecast: "Weather", macro: "Macro",
  token_onchain: "On-chain", liquidity: "Liquidity", wallet: "Wallet",
};

const refLabel = (strategy, ref) => {
  if (!ref) return "?";
  const [sigId, field] = ref.split(".");
  const sig = (strategy.signals || []).find((s) => s.id === sigId);
  const name = sig?.label || sig?.params?.instrument?.symbol || sigId;
  const fieldLabel = (field || "").replace(/_/g, " ");
  return `${name} ${fieldLabel}`.trim();
};

const sideToSide = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return refLabel({}, v.ref) || "signal";
  if (typeof v === "number") return Math.abs(v) >= 1000 ? `$${v.toLocaleString("en-US")}` : `${v}`;
  return String(v);
};

export const condText = (strategy, when) => {
  if (!when) return "";
  if (when.all) return when.all.map((c) => condText(strategy, c)).join(" AND ");
  if (when.any) return when.any.map((c) => condText(strategy, c)).join(" OR ");
  if (when.not) return `NOT (${condText(strategy, when.not)})`;
  const left = when.left?.ref ? refLabel(strategy, when.left.ref) : sideToSide(when.left?.value);
  const right = when.right?.ref ? refLabel(strategy, when.right.ref) : sideToSide(when.right?.value);
  return `${left} ${OPS[when.op] || when.op} ${right}`;
};

const sizeText = (size) => {
  if (!size) return "";
  if (size.unit === "pct_equity") return `${size.value}% of equity`;
  if (size.unit === "usd") return `$${size.value}`;
  return `${size.value} ${size.unit || ""}`;
};

export default function RulesView({ strategy, compact = false }) {
  if (!strategy) return null;
  const s = strategy;
  return (
    <div className="space-y-5" data-testid="rules-view">
      {s.thesis && !compact && (
        <p className="serif text-lg italic text-[#f3f0fd]">“{s.thesis}”</p>
      )}

      {(s.signals || []).length > 0 && (
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#a89ec4] mb-2">Watches</div>
          <div className="flex flex-wrap gap-2">
            {s.signals.map((sig) => (
              <span key={sig.id} className="inline-flex items-center gap-2 rounded-full border border-[#a855f724] bg-[#171428] px-3 py-1.5 text-xs">
                <CoinIcon symbol={sig.params?.instrument?.symbol} size={16} />
                <span className="font-medium">{sig.label || sig.params?.instrument?.symbol || sig.id}</span>
                <span className="mono text-[10px] text-[#a89ec4]">{KIND_LABEL[sig.kind] || sig.kind}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(s.triggers || []).length > 0 && (
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#a89ec4] mb-2">When</div>
          <ul className="space-y-1.5">
            {s.triggers.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[13px]">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a855f7] shrink-0" />
                <span>
                  {condText(s, t.when)}
                  {t.forMinutes ? <span className="text-[#a89ec4]"> · held for {fmtDuration(t.forMinutes)}</span> : null}
                  {t.cooldownMinutes ? <span className="text-[#a89ec4]"> · cooldown {fmtDuration(t.cooldownMinutes)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(s.actions || []).length > 0 && (
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#a89ec4] mb-2">Does</div>
          <ul className="space-y-1.5">
            {s.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[13px]">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${a.side === "short" || a.type === "close" ? "bg-[#f43f5e]" : "bg-[#10b981]"}`} />
                <span className="flex flex-wrap items-center gap-1.5">
                  {a.type === "close" ? "Close" : a.type === "alert" ? "Alert" : "Open"}
                  {a.side && <Tag tone={a.side === "short" ? "short" : "long"}>{a.side}</Tag>}
                  <b>{a.instrument?.symbol}</b>
                  {a.leverage ? <span className="mono text-[11px] text-[#a89ec4]">{a.leverage}×</span> : null}
                  {sizeText(a.size) && <span className="text-[#a89ec4]">· {sizeText(a.size)}</span>}
                  {a.instrument?.venue && <span className="mono text-[10px] text-[#a89ec4]">on {a.instrument.venue}</span>}
                </span>
              </li>
            ))}
          </ul>
          {(s.actions || []).some((a) => a.exits) && (
            <div className="mt-2 ml-3.5 flex flex-wrap gap-2">
              {s.actions.filter((a) => a.exits).flatMap((a) => {
                const e = a.exits;
                const chips = [];
                if (e.stopLoss?.pct != null) chips.push(`Stop −${e.stopLoss.pct}%`);
                if (e.takeProfit?.pct != null) chips.push(`Target +${e.takeProfit.pct}%`);
                if (e.trailingStopPct != null) chips.push(`Trail ${e.trailingStopPct}%`);
                return chips.map((c, i) => <Tag key={`${a.id}-${i}`} tone="amber">{c}</Tag>);
              })}
            </div>
          )}
        </div>
      )}

      {s.risk && !compact && (
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#a89ec4] mb-2">Risk</div>
          <div className="flex flex-wrap gap-2">
            {s.risk.maxLeverage != null && <Tag>max {s.risk.maxLeverage}× leverage</Tag>}
            {s.risk.maxDailyLossPct != null && <Tag>daily loss cap {fmtPct(s.risk.maxDailyLossPct, 0)}</Tag>}
            {s.risk.maxPositionPct != null && <Tag>max position {fmtPct(s.risk.maxPositionPct, 0)}</Tag>}
          </div>
        </div>
      )}
    </div>
  );
}
