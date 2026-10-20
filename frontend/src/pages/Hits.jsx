import React, { useEffect, useMemo, useState } from "react";
import { gh } from "../lib/api";
import { CATS, HitTile, LINE_OF } from "./Lobby";

export default function Hits() {
  const [hits, setHits] = useState([]);
  const [cat, setCat] = useState("Everything");
  const [sort, setSort] = useState("Recent");

  useEffect(() => {
    const load = () => gh("/hits").then((d) => setHits(d.hits || [])).catch(() => {});
    load();
    const iv = setInterval(load, 25000);
    return () => clearInterval(iv);
  }, []);

  const filtered = useMemo(() => {
    let out = [...hits];
    if (cat !== "Everything") {
      out = out.filter((h) => cat === "Sports"
        ? ["sports", "baseball", "basketball", "football", "soccer"].some((p) => (h.code || "").startsWith(p))
        : LINE_OF(h.code) === cat);
    }
    out.sort((a, b) => sort === "Value" ? b.value - a.value : new Date(b.at) - new Date(a.at));
    return out;
  }, [hits, cat, sort]);

  const total = hits.reduce((s, h) => s + (h.value || 0), 0);

  return (
    <div className="fadeup" data-testid="hits-page">
      <div className="eyebrow">Hall of hits</div>
      <h1 className="h1">The wall of what came out.</h1>
      <p className="mute" style={{ marginTop: 8 }}>
        {hits.length} recent pulls · real graded slabs · live as they land.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "18px 0 18px" }}>
        {CATS.map((c) => <button key={c} className={`pill${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["Recent", "Value"].map((s) => <button key={s} className={`pill${sort === s ? " on" : ""}`} onClick={() => setSort(s)}>{s}</button>)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }} data-testid="hits-grid">
        {filtered.map((h) => <HitTile key={h.id || h.at + h.name} h={h} />)}
      </div>
      {!filtered.length && <div className="panel mute" style={{ padding: 22, textAlign: "center" }}>Loading the wall…</div>}
    </div>
  );
}
