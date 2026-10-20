import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { gh, local, money, timeAgo } from "../lib/api";
import { useAuth } from "../AuthContext";

const BREAKERS = [
  { name: "Grail Break", handle: null },
  { name: "@navi9000x", handle: "navi9000x" },
];

export function LeftRail() {
  const [breaks, setBreaks] = useState([]);
  useEffect(() => {
    const load = () => gh("/breaks").then((d) => setBreaks(d.breaks || [])).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);
  const filling = (host) => breaks.filter((b) => (b.host?.handle || "") === host || (host === null && b.host?.type !== "community")).length;

  return (
    <div data-testid="left-rail">
      <div className="rail-title">Popular breakers</div>
      {BREAKERS.map((b) => (
        <div key={b.name} className="hititem" style={{ alignItems: "center" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#f2c14e,#ff8a5c)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.name}</div>
            <div className="dim" style={{ fontSize: 11 }}>{filling(b.handle)} filling</div>
          </div>
        </div>
      ))}
      <div className="rail-title">Play limits</div>
      <div className="panel" style={{ padding: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Set a daily or weekly cap on what you spend.</div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>Takes 10 seconds.</div>
      </div>
    </div>
  );
}

export function RightRail() {
  const { user, token } = useAuth();
  const [hits, setHits] = useState([]);
  const [seats, setSeats] = useState([]);
  const nav = useNavigate();
  const [authOpenNote, setAuthOpenNote] = useState(false);

  useEffect(() => {
    const load = () => gh("/hits").then((d) => setHits((d.hits || []).slice(0, 8))).catch(() => {});
    load();
    const iv = setInterval(load, 25000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (token) local.get("/me/seats", token).then((d) => setSeats(d.seats || [])).catch(() => {});
  }, [token]);

  return (
    <div data-testid="right-rail">
      <div className="rail-title">My seats</div>
      <div className="panel" style={{ padding: 14 }}>
        {user ? (
          seats.length ? (
            seats.slice(0, 5).map((s, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div className="dim" style={{ fontSize: 11 }}>{money(s.price)} seat · {timeAgo(s.at)}</div>
              </div>
            ))
          ) : (
            <div className="mute" style={{ fontSize: 12.5 }}>
              No seats yet. <Link to="/breaks" style={{ color: "var(--gold)" }}>Join a break</Link> — every seat costs the same, the oracle deals.
            </div>
          )
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Sign in to see your seats and wins</div>
            <div className="mute" style={{ fontSize: 12, margin: "4px 0 10px" }}>Email or wallet. Takes a few seconds.</div>
            <button className="btn btn-primary btn-block" onClick={() => document.querySelector("[data-testid='nav-signin']")?.click()} data-testid="rail-signin">Sign in</button>
          </>
        )}
      </div>
      <div className="rail-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Pulled on Grail Break</span>
        <span className="livedot">live</span>
      </div>
      <div data-testid="live-feed">
        {hits.map((h) => (
          <div className="hititem" key={h.id || h.at}>
            {h.front && <img src={h.front} alt={h.name} loading="lazy" />}
            <div style={{ minWidth: 0 }}>
              <span className={`rchip ${h.rarity || "common"}`}>{h.rarity || "common"}</span>
              <div className="nm">{h.name}</div>
              <div className="vl">{money(h.value)}</div>
              <div className="mt">{h.winner || "anon"} · {timeAgo(h.at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
