import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import AuthModal from "./AuthModal";
import { money, BASE } from "../lib/api";

const LINKS = [
  ["/", "Lobby"],
  ["/breaks", "Breaks"],
  ["/gacha", "Gacha"],
  ["/graildex", "Graildex"],
  ["/hits", "Hall of Hits"],
  ["/live", "Live"],
  ["/build", "Build a break"],
];

export default function TopNav() {
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const nav = useNavigate();

  return (
    <header className="topbar" data-testid="topnav">
      <Link to="/" className="brand" data-testid="brand-link" style={{ display: "flex", alignItems: "center" }}>
        <img src={`${BASE}/api/img/brand/logo.svg`} alt="Grail Break" style={{ height: 22, width: "auto" }} />
      </Link>
      <nav>
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `navlink${isActive ? " on" : ""}`}>
            {label}
          </NavLink>
        ))}
        <NavLink to="/battle" className={({ isActive }) => `navlink gold${isActive ? " on" : ""}`} data-testid="nav-battle">
          Battle Slabs <span className="nav-new">NEW</span>
        </NavLink>
        <NavLink to="/how" className={({ isActive }) => `navlink${isActive ? " on" : ""}`}>More</NavLink>
      </nav>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {user ? (
          <>
            <button className="btn mono" style={{ height: 32, fontSize: 12 }} onClick={() => nav("/me")} data-testid="nav-balance">
              {money(user.balance, 2)}
            </button>
            <button className="btn" style={{ height: 32, fontSize: 12 }} onClick={() => nav("/me")} data-testid="nav-account">
              {user.name}
            </button>
            <button className="navlink" onClick={logout} data-testid="nav-logout">Sign out</button>
          </>
        ) : (
          <button className="btn btn-primary" style={{ height: 34 }} onClick={() => setAuthOpen(true)} data-testid="nav-signin">
            Sign in
          </button>
        )}
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
