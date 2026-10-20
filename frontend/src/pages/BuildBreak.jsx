import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { local, money } from "../lib/api";
import { useAuth } from "../AuthContext";

const LINES = ["pokemon", "onepiece", "sports", "basketball", "baseball", "football", "soccer", "riftbound", "dragonball", "anime", "watches"];

export default function BuildBreak() {
  const { user, token } = useAuth();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [line, setLine] = useState("pokemon");
  const [spots, setSpots] = useState(10);
  const [price, setPrice] = useState(50);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!user) { document.querySelector("[data-testid='nav-signin']")?.click(); return; }
    setBusy(true);
    try {
      await local.post("/breaks/create", { title, line, spots, spotPrice: price }, token);
      toast.success("Break published — it's live on the breaks board");
      nav("/breaks");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fadeup" data-testid="build-page" style={{ maxWidth: 560 }}>
      <div className="eyebrow">Build a break</div>
      <h1 className="h1">Your break, your rules.</h1>
      <p className="mute" style={{ marginTop: 8 }}>Pick the line, the seats and the seat price. Publishing is free — the break lists instantly.</p>

      <div className="panel" style={{ marginTop: 22, padding: 20 }}>
        <label className="dim" style={{ fontSize: 11.5 }}>Break title</label>
        <input className="input" style={{ marginTop: 6 }} placeholder="Friday Night Pokémon…" value={title}
          onChange={(e) => setTitle(e.target.value)} data-testid="build-title" />
        <label className="dim" style={{ fontSize: 11.5, display: "block", marginTop: 14 }}>Line</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }} data-testid="build-lines">
          {LINES.map((l) => <button key={l} className={`pill${line === l ? " on" : ""}`} onClick={() => setLine(l)}>{l}</button>)}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <label className="dim" style={{ fontSize: 11.5 }}>Seats</label>
            <input className="input mono" style={{ marginTop: 6, width: 110 }} type="number" min={2} max={40} value={spots}
              onChange={(e) => setSpots(+e.target.value)} data-testid="build-spots" />
          </div>
          <div>
            <label className="dim" style={{ fontSize: 11.5 }}>Seat price (USD)</label>
            <input className="input mono" style={{ marginTop: 6, width: 130 }} type="number" min={5} max={5000} value={price}
              onChange={(e) => setPrice(+e.target.value)} data-testid="build-price" />
          </div>
        </div>
        <div className="mute" style={{ fontSize: 12.5, marginTop: 14 }}>
          Box value: <span className="gold mono">{money(spots * price)}</span> · every seat costs the same · grand prize opens last
        </div>
        <button className="btn btn-gold btn-block" style={{ marginTop: 16 }} onClick={create} disabled={busy || !title.trim()} data-testid="build-submit">
          {busy ? "Publishing…" : "Publish break"}
        </button>
      </div>
    </div>
  );
}
