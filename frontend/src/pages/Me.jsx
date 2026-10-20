import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { BASE, local, money, timeAgo } from "../lib/api";
import { useAuth } from "../AuthContext";

export default function Me() {
  const { user, token, refresh, logout, connected } = useAuth();
  const { publicKey } = useWallet();
  const [coll, setColl] = useState(null);
  const [seats, setSeats] = useState([]);
  const [battles, setBattles] = useState([]);
  const [breakBal, setBreakBal] = useState(null);
  const [busy, setBusy] = useState("");

  const load = () => {
    if (!token) return;
    local.get("/collection", token).then(setColl).catch(() => {});
    local.get("/me/seats", token).then((d) => setSeats(d.seats || [])).catch(() => {});
    fetch(`${BASE}/api/battles`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setBattles(d.mine || [])).catch(() => {});
  };
  useEffect(load, [token]);

  useEffect(() => {
    if (connected && publicKey) {
      fetch(`${BASE}/api/wallet/${publicKey.toBase58()}/break`).then((r) => r.json()).then((d) => setBreakBal(d.balance)).catch(() => {});
    }
  }, [connected, publicKey]);

  if (!user) {
    return (
      <div className="panel fadeup" style={{ padding: 30, textAlign: "center", marginTop: 30 }} data-testid="me-gate">
        <div className="h2">Your dashboard lives here</div>
        <p className="mute" style={{ fontSize: 13, marginTop: 8 }}>Sign in to see credits, seats, pulls and battles.</p>
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => document.querySelector("[data-testid='nav-signin']")?.click()} data-testid="me-signin">Sign in</button>
      </div>
    );
  }

  const topUp = async () => {
    setBusy("top");
    try {
      const d = await local.post("/me/topup", {}, token);
      setUserSafe(d.balance);
      toast.success(`Topped up — balance ${money(d.balance, 2)}`);
    } catch (e) { toast.error(e.message); } finally { setBusy(""); }
  };
  const setUserSafe = () => refresh();

  const sellback = async (p) => {
    setBusy(p.id);
    try {
      const d = await local.post(`/sellback/${p.id}`, {}, token);
      toast.success(`Sold back for ${money(d.credited, 2)}`);
      refresh(); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="fadeup" data-testid="me-page">
      <div className="eyebrow">Dashboard</div>
      <h1 className="h1" style={{ fontSize: "clamp(26px,3vw,36px)" }}>{user.name}</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 18 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div className="dim" style={{ fontSize: 11 }}>Credit balance</div>
          <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }} data-testid="me-balance">{money(user.balance, 2)}</div>
          <button className="btn" style={{ height: 30, fontSize: 11.5, marginTop: 8 }} onClick={topUp} disabled={busy === "top"} data-testid="me-topup">
            {busy === "top" ? "…" : "+ $250 practice credits"}
          </button>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div className="dim" style={{ fontSize: 11 }}>Collection</div>
          <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }} data-testid="me-kept">{coll ? coll.kept : "—"}</div>
          <div className="mute" style={{ fontSize: 11.5, marginTop: 4 }}>slabs kept · worth {money(coll?.keptValue)}</div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div className="dim" style={{ fontSize: 11 }}>Seats held</div>
          <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }} data-testid="me-seats">{seats.length}</div>
          <div className="mute" style={{ fontSize: 11.5, marginTop: 4 }}>across open breaks</div>
        </div>
        {connected && (
          <div className="panel" style={{ padding: 16 }} data-testid="me-wallet-card">
            <div className="dim" style={{ fontSize: 11 }}>$BREAK in wallet</div>
            <div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }} data-testid="me-break-bal">
              {breakBal == null ? "—" : breakBal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <div className="mute mono" style={{ fontSize: 10.5, marginTop: 4 }}>{publicKey?.toBase58().slice(0, 6)}…{publicKey?.toBase58().slice(-4)}</div>
          </div>
        )}
      </div>

      <h2 className="h2" style={{ marginTop: 26 }}>Your pulls</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 12 }} data-testid="me-pulls">
        {(coll?.pulls || []).map((p) => (
          <div key={p.id} className="cardtile" style={p.status === "sold_back" ? { opacity: 0.55 } : {}}>
            {p.card.front && <img src={p.card.front} alt={p.card.name} loading="lazy" />}
            <div className="meta">
              <div className="nm">{p.card.name}</div>
              <div className="sub">{p.machineName} pack · {timeAgo(p.at)}</div>
              <div className="row">
                <span className="vl">{money(p.card.value)}</span>
                <span className={`rchip ${p.rarity}`}>{p.rarity}</span>
              </div>
              {p.status === "kept" ? (
                <button className="btn" style={{ height: 28, fontSize: 11, width: "100%", marginTop: 8 }}
                  onClick={() => sellback(p)} disabled={busy === p.id} data-testid={`sellback-${p.id}`}>
                  {busy === p.id ? "…" : `Sell back ${money(p.price * p.buybackPct / 100, 2)}`}
                </button>
              ) : (
                <div className="dim" style={{ fontSize: 10.5, marginTop: 8 }}>sold back · +{money(p.soldFor, 2)}</div>
              )}
            </div>
          </div>
        ))}
        {coll && !coll.pulls.length && <div className="panel mute" style={{ padding: 20, textAlign: "center", gridColumn: "1/-1" }}>No pulls yet — <a href="/gacha" style={{ color: "var(--gold)" }}>rip your first pack</a>.</div>}
      </div>

      <h2 className="h2" style={{ marginTop: 26 }}>Your seats</h2>
      <div style={{ marginTop: 12 }} data-testid="me-seats-list">
        {seats.map((s, i) => (
          <div key={i} className="breakrow" style={{ gridTemplateColumns: "1fr 90px 110px" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.title}</div>
            <span className="mono gold">{money(s.price)}</span>
            <span className="dim" style={{ fontSize: 11.5 }}>{timeAgo(s.at)}</span>
          </div>
        ))}
        {!seats.length && <div className="panel mute" style={{ padding: 18, textAlign: "center" }}>No seats — <a href="/breaks" style={{ color: "var(--gold)" }}>join a break</a>.</div>}
      </div>

      <button className="btn" style={{ marginTop: 26 }} onClick={logout} data-testid="me-logout">Sign out</button>
    </div>
  );
}
