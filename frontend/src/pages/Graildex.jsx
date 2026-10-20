import React, { useEffect, useMemo, useState } from "react";
import { gh, money } from "../lib/api";
import { CATS, LINE_OF } from "./Lobby";

export default function Graildex() {
  const [hits, setHits] = useState([]);
  const [cat, setCat] = useState("Everything");
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => gh("/hits").then((d) => setHits(d.hits || [])).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const cards = useMemo(() => {
    const byCard = {};
    for (const h of hits) {
      const k = h.front || h.name;
      if (!k) continue;
      if (!byCard[k] || h.value > byCard[k].value) byCard[k] = h;
    }
    let out = Object.values(byCard);
    if (cat !== "Everything") {
      out = out.filter((h) => cat === "Sports"
        ? ["sports", "baseball", "basketball", "football", "soccer"].some((p) => (h.code || "").startsWith(p))
        : LINE_OF(h.code) === cat);
    }
    if (q) out = out.filter((h) => (h.name || "").toLowerCase().includes(q.toLowerCase()) || (h.set || "").toLowerCase().includes(q.toLowerCase()));
    out.sort((a, b) => b.value - a.value);
    return out;
  }, [hits, cat, q]);

  return (
    <div className="fadeup" data-testid="graildex-page">
      <div className="eyebrow">Graildex</div>
      <h1 className="h1">Every slab, indexed.</h1>
      <p className="mute" style={{ marginTop: 8 }}>The cards moving through the machines right now — names, grades, and what they're worth.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "18px 0 10px" }}>
        {CATS.map((c) => <button key={c} className={`pill${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <input className="input" placeholder="Search the dex — name or set…" value={q} onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 340 }} data-testid="graildex-search" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }} data-testid="graildex-grid">
        {cards.map((h) => (
          <div key={h.front || h.name} className="cardtile">
            {h.front && <img src={h.front} alt={h.name} loading="lazy" />}
            <div className="meta">
              <div className="nm">{h.name}</div>
              <div className="sub">{[h.year, h.set].filter(Boolean).join(" · ")}</div>
              <div className="row">
                <span className="vl">{money(h.value)}</span>
                <span className={`rchip ${h.rarity || "common"}`}>{h.rarity || "common"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
