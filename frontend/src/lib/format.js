export const fmtUsd = (v, d = 2) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const fmtUsd0 = (v) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fmtUsdSigned = (v) => {
  if (v == null) return "—";
  const n = Number(v);
  return `${n < 0 ? "-" : "+"}${fmtUsd(Math.abs(n))}`;
};

export const fmtNum = (v, d = 0) =>
  v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

export const fmtPct = (v, d = 1) => (v == null ? "—" : `${Number(v).toFixed(d)}%`);

export const fmtPctSigned = (v, d = 1) => {
  if (v == null) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
};

export const short = (s, h = 4, t = 4) => (s && s.length > h + t + 2 ? `${s.slice(0, h)}…${s.slice(-t)}` : s || "—");

export const fmtAge = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const fmtDuration = (mins) => {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};
