import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2 } from "lucide-react";

export const Panel = ({ className = "", children, ...rest }) => (
  <div className={`panel ${className}`} {...rest}>{children}</div>
);

export const ExtLink = ({ href, className = "", children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    className={`inline-flex items-center gap-1 text-[#f1f5f9] hover:underline ${className}`}>
    {children} <ArrowUpRight size={12} />
  </a>
);

export const Loading = ({ label = "Loading" }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-[#9aa0ae]">
    <Loader2 className="animate-spin" size={16} />
    <span className="mono text-xs uppercase tracking-wider">{label}</span>
  </div>
);

export const Empty = ({ children }) => (
  <div className="py-14 text-center text-sm text-[#9aa0ae]">{children}</div>
);

export const Tag = ({ children, tone = "neutral" }) => {
  const tones = {
    neutral: "bg-[#ffffff16] text-[#f4f4f5] border-[#ffffff26]",
    long: "bg-[#10b98124] text-[#10b981] border-[#10b98138]",
    short: "bg-[#f43f5e1f] text-[#f43f5e] border-[#f43f5e38]",
    accent: "bg-[#ffffff1c] text-[#f1f5f9] border-[#ffffff3d]",
    amber: "bg-[#f59e0b1f] text-[#fbbf24] border-[#f59e0b38]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 mono text-[10px] uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
};

export const CoinIcon = ({ symbol, size = 20 }) => {
  const [err, setErr] = React.useState(false);
  if (!symbol || err) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-[#ffffff16] mono text-[9px] text-[#9aa0ae]"
        style={{ width: size, height: size }}>
        {(symbol || "?").slice(0, 2)}
      </span>
    );
  }
  return (
    <img src={`/coins/${symbol}.svg`} alt={symbol} width={size} height={size} className="rounded-full" onError={() => setErr(true)} />
  );
};

export const Stat = ({ label, value, sub, testId }) => (
  <div className="px-5 py-4" data-testid={testId}>
    <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">{label}</div>
    <div className="mt-1 text-xl font-medium text-[#f4f4f5] tnum">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-[#9aa0ae]">{sub}</div>}
  </div>
);

// minimal inline area chart for equity curves
export const Sparkline = ({ points, height = 120, stroke = "#10b981" }) => {
  if (!points || points.length < 2) return null;
  const w = 600, h = height;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const sx = (t) => ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * w;
  const sy = (v) => h - 6 - ((v - min) / span) * (h - 12);
  const line = points.map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ");
  const last = ys[ys.length - 1];
  const color = last >= ys[0] ? "#10b981" : "#f43f5e";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" data-testid="sparkline">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.08" stroke="none" />
      <path d={line} fill="none" stroke={stroke === "#10b981" ? color : stroke} strokeWidth="1.6" />
    </svg>
  );
};
