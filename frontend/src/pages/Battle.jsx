import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { BASE, local, money, packArt } from "../lib/api";
import { useAuth } from "../AuthContext";

export default function Battle() {
  const { user, token, refresh } = useAuth();
  const [data, setData] = useState({ open: [], mine: [] });
  const [gacha, setGacha] = useState(null);
  const [machine, setMachine] = useState("gb-poke-25");
  const [players, setPlayers] = useState(4);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null); // finished battle detail

  const load = () => fetch(`${BASE}/api/battles`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => {
    load();
    fetch(`${BASE}/api/data/gacha.json`).then((r) => r.json()).then(setGacha).catch(() => {});
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [token]);

  const machines = (gacha?.lines || []).flatMap((l) => l.machines.filter((m) => m.live !== false));

  const create = async () => {
    if (!user) { document.querySelector("[data-testid='nav-signin']")?.click(); return; }
    setBusy(true);
    try {
      await local.post("/battles", { machine, players }, token);
      toast.success("Battle created — it runs when the last player joins");
      refresh(); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const join = async (b) => {
    if (!user) { document.querySelector("[data-testid='nav-signin']")?.click(); return; }
    setBusy(true);
    try {
      await local.post(`/battles/${b.id}/join`, {}, token);
      toast.success("You're in — everyone rips when the table fills");
      refresh(); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const openDetail = async (b) => {
    const d = await fetch(`${BASE}/api/battles/${b.id}`).then((r) => r.json()).catch(() => null);
    if (d?.battle) setView(d.battle);
  };

  return (
    <div className="fadeup" data-testid="battle-page">
      <div className="eyebrow">Battle slabs · new</div>
      <h1 className="h1 gold">Rip the same pack. Best slab takes the pot.</h1>
      <p className="mute" style={{ marginTop: 8, maxWidth: 560 }}>
        2 to 20 players, same machine, everyone rips at once. Every slab is revealed — the highest value takes the pot.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 22 }}>
        {[["1", "Pick a pack", "Any machine, $25 to $5,000. 2 to 20 players."],
          ["2", "Everyone rips", "Same pack, same time. Every slab is revealed."],
          ["3", "Best slab wins", "The highest value takes every slab's value as the pot."]].map(([n, t, s]) => (
          <div key={n} className="panel" style={{ padding: 16, display: "flex", gap: 12 }}>
            <span className="disp gold" style={{ fontSize: 22, fontWeight: 800 }}>{n}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t}</div>
              <div className="mute" style={{ fontSize: 12, marginTop: 3 }}>{s}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 20, padding: 20 }} data-testid="battle-create">
        <div className="eyebrow">Create a battle</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input" style={{ maxWidth: 260 }} value={machine} onChange={(e) => setMachine(e.target.value)} data-testid="battle-machine">
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name} — {money(m.price)}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 140 }} value={players} onChange={(e) => setPlayers(+e.target.value)} data-testid="battle-players">
            {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} players</option>)}
          </select>
          <button className="btn btn-gold" onClick={create} disabled={busy} data-testid="battle-create-btn">
            {busy ? "…" : "Create a battle"}
          </button>
        </div>
      </div>

      <h2 className="h2" style={{ marginTop: 26 }}>Open tables</h2>
      <div style={{ marginTop: 12 }} data-testid="battle-open">
        {data.open.map((b) => (
          <div key={b.id} className="breakrow" style={{ gridTemplateColumns: "1fr 90px 120px 90px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <img src={packArt(b.price, true)} alt="" style={{ width: 30, height: 42, objectFit: "cover", borderRadius: 5 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.machineName} battle</div>
                <div className="dim" style={{ fontSize: 11 }}>by {b.by?.split("@")[0]} · {money(b.price)} entry</div>
              </div>
            </div>
            <span className="mono mute">{b.entries?.length}/{b.players} in</span>
            <span className="mono gold">{money(b.price * b.players)} pot</span>
            <button className="btn btn-primary" style={{ height: 32, fontSize: 12 }} onClick={() => join(b)} disabled={busy} data-testid={`battle-join-${b.id}`}>Join</button>
          </div>
        ))}
        {!data.open.length && <div className="panel mute" style={{ padding: 20, textAlign: "center" }}>No open tables — create one above.</div>}
      </div>

      {data.mine.length > 0 && (
        <>
          <h2 className="h2" style={{ marginTop: 26 }}>Your battles</h2>
          <div style={{ marginTop: 12 }} data-testid="battle-mine">
            {data.mine.map((b) => (
              <div key={b.id} className="breakrow" style={{ gridTemplateColumns: "1fr 110px 110px 90px", cursor: "pointer" }} onClick={() => b.status === "done" && openDetail(b)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.machineName} battle</div>
                  <div className="dim" style={{ fontSize: 11 }}>{b.entries?.length}/{b.players} players</div>
                </div>
                <span className={`mono ${b.status === "done" ? "green" : "mute"}`}>{b.status}</span>
                <span className="mono gold">{b.status === "done" ? `${money(b.pot)} pot` : "—"}</span>
                <span className="dim" style={{ fontSize: 11.5 }}>{b.status === "done" ? (b.winner === user?.email ? "You won" : "view") : "waiting"}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view && (
        <div className="overlay" onClick={() => setView(null)} data-testid="battle-detail">
          <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Battle result</div>
            <div className="h2" style={{ marginTop: 4 }}>{view.machineName} · pot {money(view.pot)}</div>
            <div className="gold" style={{ marginTop: 4, fontWeight: 700 }}>Winner: {view.winner?.split("@")[0]}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 16 }}>
              {(view.results || []).map((r, i) => (
                <div key={i} className="cardtile" style={r.email === view.winner ? { borderColor: "var(--gold)" } : {}}>
                  {r.card?.front && <img src={r.card.front} alt={r.card.name} />}
                  <div className="meta">
                    <div className="nm" style={{ fontSize: 11.5 }}>{r.card?.name}</div>
                    <div className="row">
                      <span className="vl" style={{ fontSize: 12.5 }}>{money(r.card?.value)}</span>
                      <span className={`rchip ${r.rarity}`}>{r.rarity}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-block" style={{ marginTop: 16 }} onClick={() => setView(null)} data-testid="battle-close">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
