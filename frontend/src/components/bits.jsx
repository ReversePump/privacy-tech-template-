import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { smallPrice, subDigit } from "../lib/format";
import { useOurDesks } from "../lib/useOurDesks";

export const Panel = ({ className = "", children, ...rest }) => (
  <div className={`rounded-xl border border-black/10 bg-black/[0.04] backdrop-blur-xl ${className}`} {...rest}>
    {children}
  </div>
);

export const Stat = ({ label, value, sub, testId }) => (
  <div className="px-4 py-3 md:px-5 md:py-4" data-testid={testId}>
    <div className="text-[10px] uppercase tracking-[0.14em] text-[#93a184] font-mono">{label}</div>
    <div className="mt-1 font-mono text-base md:text-lg text-[#131a0f] tnum">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-[#93a184] font-mono">{sub}</div>}
  </div>
);

export const StatRow = ({ children, className = "" }) => (
  <Panel className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-${Math.min(children.length, 7)} divide-x divide-black/5 overflow-hidden ${className}`}>
    {children}
  </Panel>
);

export const CoinAvatar = ({ url, name, size = 32, className = "" }) => {
  const [err, setErr] = React.useState(false);
  if (!url || err) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-[#3F9E00]/10 border border-[#3F9E00]/20 text-[#3F9E00] font-mono ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {(name || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name || "coin"}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErr(true)}
      className={`rounded-lg object-cover border border-black/10 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export const SubPrice = ({ value, prefix = "", className = "" }) => {
  const p = smallPrice(value);
  return (
    <span className={`font-mono tnum ${className}`}>
      {prefix}
      {p.head}
      {p.zeros > 0 && <sub className="text-[0.65em] text-[#5c6b50]">{p.zeros}</sub>}
      {p.tail}
    </span>
  );
};

export const KindPill = ({ kind }) => {
  const map = {
    buy: ["Buy", "text-[#38c973]", "▲"],
    sell: ["Sell", "text-[#ff4d4f]", "▼"],
    claim: ["Claim", "text-[#3F9E00]", "◆"],
    payout: ["Payout", "text-[#c8a24a]", "⭱"],
    launch: ["Launch", "text-[#131a0f]", "✦"],
  };
  const [label, color, icon] = map[kind] || [kind, "text-[#5c6b50]", "•"];
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${color}`}>
      <span className="text-[9px]">{icon}</span>
      {label}
    </span>
  );
};

export const ExtLink = ({ href, children, className = "", ...rest }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1 text-[#5c6b50] hover:text-[#3F9E00] transition-colors ${className}`}
    {...rest}
  >
    {children}
    <ArrowUpRight size={12} />
  </a>
);

export const Loading = ({ label = "Loading" }) => (
  <div className="flex items-center gap-2 py-10 justify-center text-[#93a184] font-mono text-sm" data-testid="loading">
    <Loader2 size={16} className="animate-spin" />
    {label}…
  </div>
);

export const Empty = ({ children }) => (
  <div className="py-10 text-center text-[#93a184] font-mono text-sm" data-testid="empty-state">{children}</div>
);

export const PageHead = ({ kicker, title, accent, sub, right }) => (
  <div className="mb-8 md:mb-10">
    {kicker && (
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#3F9E00]">
        <span className="inline-block h-1.5 w-1.5 rounded-[3px] bg-[#3F9E00] pip-blink" />
        {kicker}
      </div>
    )}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-3xl md:text-5xl font-medium tracking-tight text-[#131a0f]">
        {title} {accent && <em className="font-serif italic text-[#3F9E00]">{accent}</em>}
      </h1>
      {right}
    </div>
    {sub && <p className="mt-3 max-w-2xl text-sm md:text-base text-[#5c6b50] font-light leading-relaxed">{sub}</p>}
  </div>
);

export const TypeBadge = ({ desk }) => {
  const { ourIds } = useOurDesks();
  if (!ourIds.has(desk?.id)) return null;
  const t = desk.origin === "launch" ? "LAUNCHED HERE" : "ONBOARDED";
  return (
    <span className="rounded-[3px] border border-black/10 bg-black/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#5c6b50]">
      {t}
    </span>
  );
};

export const StatusDot = ({ status }) => {
  const live = status === "running";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#5c6b50]">
      <span className={`h-1.5 w-1.5 rounded-[3px] ${live ? "bg-[#38c973] pip-blink" : "bg-[#556b82]"}`} />
      {live ? "Running" : status || "—"}
    </span>
  );
};

export const CoinCell = ({ imageUrl, name, ticker, id }) => (
  <Link to={`/desk/${id}`} className="flex items-center gap-2.5 min-w-0 group" data-testid={`coin-cell-${ticker || id}`}>
    <CoinAvatar url={imageUrl} name={name} size={28} />
    <span className="min-w-0">
      <span className="block truncate text-[#131a0f] group-hover:text-[#3F9E00] transition-colors text-[13px]">{name}</span>
      <span className="block font-mono text-[11px] text-[#93a184]">${ticker}</span>
    </span>
  </Link>
);
