import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { gh, local, money, packArt, BASE } from "../lib/api";
import { useAuth } from "../AuthContext";

const FILTERS = ["All", "Filling fast", "Under $50", "Just opened"];

export function BreakRow({ b, onJoin, onOpen, joining }) {
  const taken = b.taken ?? b.seatsTaken ?? 0;
  const pct = b.spots ? Math.round((taken / b.spots) * 100) : 0;
  const filling = pct >= 50;
  return (
    <div className={`breakrow${filling ? " filling" : ""}`} data-testid={`break-${b.id}`} onClick={() => onOpen(b)} style={{ cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <img src={packArt(b.spotPrice, true)} alt="" style={{ width: 34, height: 46, objectFit: "cover", borderRadius: 5 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>
          <div className="dim" style={{ fontSize: 11 }}>
            {b.host?.type === "community" && <span className="green">✓ Breaker · </span>}
            {filling && <span style={{ color: "var(--gold)" }}>Filling · </span>}
            {b.lineName || b.line} · {b.packs?.length || b.spots} packs · {b.host?.name || "Grail Break"}
          </div>
        </div>
      </div>
      <span className="gold mono" style={{ fontWeight: 700 }}>{money(b.spotPrice)}</span>
      <span className="mute mono hidem">{money(b.cost)}</span>
      <div className="hidem">
        <div className="seatbar"><i style={{ width: `${pct}%` }} /></div>
        <div className="dim mono" style={{ fontSize: 10.5, marginTop: 3 }}>{taken}/{b.spots}</div>
      </div>
      <div className="mute hidem" style={{ fontSize: 12 }}>{b.host?.handle ? `@${b.host.handle}` : b.host?.name || "—"}</div>
      <button className="btn btn-primary" style={{ height: 32, fontSize: 12 }}
        disabled={joining === b.id}
        onClick={(e) => { e.stopPropagation(); onJoin(b); }}
        data-testid={`join-${b.id}`}>
        {joining === b.id ? "…" : "Join"}
      </button>
    </div>
  );
}

function BreakDetail({ b, onClose, onJoin, joining }) {
  const seats = b.seats || [];
  return (
    <div className="overlay" onClick={onClose} data-testid="break-detail">
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div className="eyebrow">{b.lineName || b.line} break</div>
            <div className="h2" style={{ marginTop: 4 }}>{b.title}</div>
            <div className="mute" style={{ fontSize: 12.5, marginTop: 4 }}>
              {b.spots} seats · {money(b.spotPrice)} each · box value {money(b.cost)} · {b.grands || 1} grand hit{(b.grands || 1) > 1 ? "s" : ""} last
            </div>
            {b.proof && (
              <a className="mono dim" style={{ fontSize: 10.5, display: "block", marginTop: 6 }} href={`https://solscan.io/tx/${b.proof}`} target="_blank" rel="noopener noreferrer">
                deal proof ↗ on chain
              </a>
            )}
          </div>
          {b.grandImage && <img src={b.grandImage} alt="grand" style={{ width: 74, borderRadius: 8 }} />}
        </div>
        {seats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, marginTop: 16 }} data-testid="seat-grid">
            {seats.map((s) => (
              <div key={s.n} className="panel" style={{ padding: "8px 6px", textAlign: "center", borderColor: s.state === "paid" ? "rgba(61,220,132,.3)" : "var(--line)" }}>
                <div className="mono dim" style={{ fontSize: 9.5 }}>SEAT {s.n}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: s.state === "paid" ? "var(--green)" : "var(--mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.state === "paid" ? (s.owner?.name || s.owner?.wallet || "taken") : "open"}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={joining === b.id}
          onClick={() => onJoin(b)} data-testid="detail-join">
          {joining === b.id ? "…" : `Join — ${money(b.spotPrice)} a seat`}
        </button>
        <p className="dim" style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>Max 2 seats per player · cheapest pack first, the grand prize opens last.</p>
      </div>
    </div>
  );
}

export default function Breaks() {
  const { user, token, refresh } = useAuth();
  const [breaks, setBreaks] = useState([]);
  const [localBreaks, setLocalBreaks] = useState([]);
  const [filter, setFilter] = useState("All");
  const [line, setLine] = useState("All");
  const [open, setOpen] = useState(null);
  const [joining, setJoining] = useState("");

  useEffect(() => {
    const load = () => {
      gh("/breaks").then((d) => setBreaks(d.breaks || [])).catch(() => {});
      fetch(`${BASE}/api/breaks/local`).then((r) => r.json()).then((d) => setLocalBreaks(d.breaks || [])).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const lines = useMemo(() => ["All", ...new Set(breaks.map((b) => b.lineName || b.line))], [breaks]);

  const filtered = useMemo(() => {
    let out = [...breaks];
    if (line !== "All") out = out.filter((b) => (b.lineName || b.line) === line);
    if (filter === "Filling fast") out = out.filter((b) => (b.taken || 0) / (b.spots || 1) >= 0.5);
    if (filter === "Under $50") out = out.filter((b) => b.spotPrice < 50);
    if (filter === "Just opened") out = out.filter((b) => (b.taken || 0) === 0);
    return out;
  }, [breaks, filter, line]);

  const join = async (b) => {
    if (!user) {
      document.querySelector("[data-testid='nav-signin']")?.click();
      toast.info("Sign in first — practice credits are free");
      return;
    }
    if (b.local) {
      toast.info("Local breaks fill from the community — seat reserved");
    }
    setJoining(b.id);
    try {
      await local.post(`/breaks/${b.id}/join`, {}, token);
      toast.success(`Seat reserved in ${b.title} — ${money(b.spotPrice)}`);
      refresh();
      setOpen(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setJoining("");
    }
  };

  return (
    <div className="fadeup" data-testid="breaks-page">
      <div className="eyebrow">Group breaks</div>
      <h1 className="h1">Join a break.</h1>
      <p className="mute" style={{ marginTop: 8 }}>
        {breaks.length} open · every seat costs the same, an oracle deals the packs, the grand prize goes last.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "18px 0 16px" }}>
        {FILTERS.map((f) => <button key={f} className={`pill${filter === f ? " on" : ""}`} onClick={() => setFilter(f)} data-testid={`filter-${f.replace(/\W+/g, "-").toLowerCase()}`}>{f}</button>)}
        <span style={{ width: 8 }} />
        {lines.map((l) => <button key={l} className={`pill${line === l ? " on" : ""}`} onClick={() => setLine(l)}>{l}</button>)}
      </div>

      <div className="mono dim" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.6fr) 90px 90px minmax(120px,.8fr) minmax(110px,.8fr) 70px", gap: 12, padding: "0 14px", fontSize: 9.5, letterSpacing: ".1em", marginBottom: 6 }}>
        <span>BREAK</span><span>SEAT</span><span className="hidem">BOX VALUE</span><span className="hidem">SEATS</span><span className="hidem">HOST</span><span />
      </div>
      {[...localBreaks, ...filtered].map((b) => (
        <BreakRow key={b.id} b={b} onJoin={join} onOpen={setOpen} joining={joining} />
      ))}
      {!filtered.length && !localBreaks.length && <div className="panel mute" style={{ padding: 22, textAlign: "center" }}>No breaks match — check back soon.</div>}

      <div className="panel" style={{ marginTop: 22, padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", borderColor: "rgba(242,193,78,.25)" }}>
        <div>
          <div className="eyebrow">Build your own break</div>
          <div className="h2" style={{ marginTop: 6 }}>Pick the grand prize, the seats and the style.</div>
          <p className="mute" style={{ fontSize: 12.5, marginTop: 6 }}>Every pack is priced live. Publishing is free.</p>
        </div>
        <Link to="/build" className="btn btn-gold" data-testid="build-cta">Build a break</Link>
      </div>

      {open && <BreakDetail b={open} onClose={() => setOpen(null)} onJoin={join} joining={joining} />}
    </div>
  );
}
