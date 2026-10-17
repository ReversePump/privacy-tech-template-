export const LAMPORTS = 1_000_000_000;

export const lamportsToSol = (l) => {
  if (l === null || l === undefined) return null;
  try { return Number(BigInt(l)) / LAMPORTS; } catch { const n = Number(l); return Number.isFinite(n) ? n / LAMPORTS : null; }
};

export const fmtSol = (l, digits = 2) => {
  const v = typeof l === "number" ? l : lamportsToSol(l);
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })} SOL`;
};

export const fmtSolSigned = (l, digits = 2) => {
  const v = typeof l === "number" ? l : lamportsToSol(l);
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: digits })} SOL`;
};

export const fmtUsd = (v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  // tiny price -> subscript style parts
  return `$${n.toPrecision(2)}`;
};

// Returns {head, zeros, tail} for prices like 0.00000181 -> 0.0₅181
export const smallPrice = (v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) === 0)
    return { head: "0", zeros: 0, tail: "" };
  const n = Number(v);
  if (n >= 0.001) return { head: n.toFixed(Math.min(6, Math.max(2, -Math.floor(Math.log10(n)) + 3))), zeros: 0, tail: "" };
  const s = n.toFixed(20);
  const m = s.match(/^0\.(0+)(\d{1,4})/);
  if (!m) return { head: n.toPrecision(3), zeros: 0, tail: "" };
  return { head: "0.0", zeros: m[1].length, tail: m[2] };
};

const SUBS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
export const subDigit = (n) => String(n).split("").map((d) => SUBS[+d] || d).join("");

export const fmtAge = (iso) => {
  if (!iso) return "—";
  const t = typeof iso === "string" ? Date.parse(iso) : iso;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export const short = (addr, a = 4, b = 4) =>
  addr ? `${addr.slice(0, a)}…${addr.slice(-b)}` : "—";

export const fmtNum = (v, digits = 0) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: digits });
};

export const fmtPct = (v, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(digits)}%`;

export const solscanTx = (sig) => `https://solscan.io/tx/${sig}`;
export const solscanAcct = (a) => `https://solscan.io/account/${a}`;
export const pumpCoin = (mint) => `https://pump.fun/coin/${mint}`;
export const dexscreener = (mint) => `https://dexscreener.com/solana/${mint}`;

export const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const bytesToB64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
