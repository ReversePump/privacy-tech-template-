import React, { useEffect, useMemo, useState } from "react";
import { gh, money, timeAgo } from "../lib/api";

export const LINE_OF = (code = "") => {
  if (code.startsWith("pokemon")) return "Pokémon";
  if (code.startsWith("onepiece")) return "One Piece";
  if (code.startsWith("dragonball")) return "Dragon Ball";
  if (code.startsWith("riftbound")) return "Riftbound";
  if (code.startsWith("ewatch")) return "Watches";
  if (code.startsWith("anime")) return "Anime & Pop";
  if (code.startsWith("basketball")) return "Basketball";
  if (code.startsWith("baseball")) return "Baseball";
  if (code.startsWith("football")) return "Football";
  if (code.startsWith("soccer")) return "Soccer";
  return "Sports";
};

export const CATS = ["Everything", "Pokémon", "Sports", "Watches", "One Piece", "Basketball", "Anime & Pop", "Dragon Ball", "Soccer"];

export function HitTile({ h }) {
  const mult = h.price && h.value ? h.value / h.price : null;
  return (
    <div className="cardtile fadeup" data-testid="hit-tile">
      {mult && mult >= 1.5 && <span className="xmult">{mult.toFixed(1)}×</span>}
      {h.front && <img src={h.front} alt={h.name} loading="lazy" />}
      <div className="meta">
        <div className="nm">{h.name}</div>
        <div className="sub">{[h.year, h.grader && h.grade ? `${h.grader} ${h.grade}` : null].filter(Boolean).join(" · ")}</div>
        <div className="row">
          <span className="vl">{money(h.value)}</span>
          <span className="dim" style={{ fontSize: 10.5 }}>{timeAgo(h.at)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Lobby() {
  const [stats, setStats] = useState(null);
  const [hits, setHits] = useState([]);
  const [cat, setCat] = useState("Everything");
  const [when, setWhen] = useState("All time");
  const [bigOnly, setBigOnly] = useState(false);
  const [sort, setSort] = useState("Recent");
  const [token, setToken] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    gh("/stats").then(setStats).catch(() => {});
    const load = () => gh("/hits").then((d) => setHits(d.hits || [])).catch(() => {});
    load();
    const iv = setInterval(load, 25000);
    const t = () => fetch(`${process.env.REACT_APP_BACKEND_URL}/api/token/break`).then((r) => r.json()).then(setToken).catch(() => {});
    t();
    const iv2 = setInterval(t, 60000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, []);

  const best = stats?.bestHit;
  const filtered = useMemo(() => {
    let out = [...hits];
    if (cat !== "Everything") {
      out = out.filter((h) => cat === "Sports"
        ? ["sports", "baseball", "basketball", "football", "soccer"].some((p) => (h.code || "").startsWith(p))
        : LINE_OF(h.code) === cat);
    }
    if (when !== "All time") {
      const cutoff = Date.now() - (when === "24 hours" ? 86400e3 : 7 * 86400e3);
      out = out.filter((h) => new Date(h.at).getTime() > cutoff);
    }
    if (bigOnly) out = out.filter((h) => h.value >= 250);
    out.sort((a, b) => sort === "Value" ? b.value - a.value : new Date(b.at) - new Date(a.at));
    return out;
  }, [hits, cat, when, bigOnly, sort]);

  return (
    <div className="fadeup" data-testid="lobby-page">
      <div className="eyebrow">Hall of hits</div>
      <h1 className="h1" style={{ marginTop: 6 }}>Every pull, live.</h1>
      <p className="mute" style={{ marginTop: 8, maxWidth: 520 }}>Real cards from real packs on Grail Break. Who pulled it, where, and what it's worth.</p>

      {best && (
        <div className="panel" style={{ marginTop: 20, padding: 20, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }} data-testid="best-pull">
          {best.front && <img src={best.front} alt={best.name} style={{ width: 130, borderRadius: 10 }} />}
          <div style={{ minWidth: 240, flex: 1 }}>
            <div className="eyebrow">Best pull on Grail Break</div>
            <div className="h2" style={{ marginTop: 6 }}>{best.name}</div>
            <div className="mute" style={{ fontSize: 12.5, marginTop: 3 }}>{[best.year, [best.grader, best.grade].filter(Boolean).join(" "), best.set].filter(Boolean).join(" · ")}</div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="gold disp" style={{ fontSize: 30, fontWeight: 800 }} data-testid="best-value">{money(best.value)}</span>
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{best.winner ? `Pulled by ${best.winner}` : ""} {best.at ? `· ${timeAgo(best.at)}` : ""}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 22 }} data-testid="cat-pills">
        {CATS.map((c) => <button key={c} className={`pill${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)
        }
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {["24 hours", "7 days", "All time"].map((w) => <button key={w} className={`pill${when === w ? " on" : ""}`} onClick={() => setWhen(w)}>{w}</button>)}
        <button className={`pill${bigOnly ? " on" : ""}`} onClick={() => setBigOnly(!bigOnly)}>Big hits · 1.5×+</button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 26, marginBottom: 14 }}>
        <span className="h2">Pulls</span>
        <span className="dim" style={{ fontSize: 12 }}>{filtered.length} pulls →</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["Recent", "Value"].map((s) => <button key={s} className={`pill${sort === s ? " on" : ""}`} onClick={() => setSort(s)}>{s}</button>)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }} data-testid="pulls-grid">
        {filtered.map((h) => <HitTile key={h.id || h.at + h.name} h={h} />)}
      </div>

      {/* $BREAK token */}
      <div className="panel" style={{ marginTop: 34, padding: 20 }} data-testid="break-token">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="eyebrow">$BREAK token · Solana</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="disp" style={{ fontSize: 24, fontWeight: 800 }} data-testid="break-price">
                {token?.priceUsd ? `$${token.priceUsd < 0.001 ? token.priceUsd.toExponential(2) : token.priceUsd.toPrecision(3)}` : "—"}
              </span>
              {token?.change24hPct != null && (
                <span className={token.change24hPct >= 0 ? "green" : ""} style={{ color: token.change24hPct >= 0 ? "var(--green)" : "var(--red)", fontSize: 13 }}>
                  {token.change24hPct >= 0 ? "+" : ""}{token.change24hPct}% 24h
                </span>
              )}
            </div>
            <code className="mono dim" style={{ fontSize: 11, wordBreak: "break-all", display: "block", marginTop: 8 }} data-testid="break-ca">
              BREAKLm9nsBW8M5ZTk52EUpwSC5cdCepdjUMSPnCxTgd
            </code>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" data-testid="break-ca-copy" onClick={async () => {
              await navigator.clipboard.writeText("BREAKLm9nsBW8M5ZTk52EUpwSC5cdCepdjUMSPnCxTgd").catch(() => {});
              setCopied(true); setTimeout(() => setCopied(false), 1400);
            }}>{copied ? "Copied ✓" : "Copy CA"}</button>
            <a className="btn btn-gold" href="https://jup.ag/tokens/BREAKLm9nsBW8M5ZTk52EUpwSC5cdCepdjUMSPnCxTgd" target="_blank" rel="noopener noreferrer" data-testid="break-buy">Buy $BREAK</a>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26, padding: "18px 0", borderTop: "1px solid var(--line)" }} className="dim">
        <span style={{ fontSize: 12 }}>Every pack, pull, price and odd shown here comes from live market data. Play limits take 10 seconds to set — breaks are for fun.</span>
      </div>
    </div>
  );
}
