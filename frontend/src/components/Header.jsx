import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Search, Wallet, LogOut, LayoutDashboard, KeyRound } from "lucide-react";
import { useAuth } from "../solana/AuthContext";
import { short } from "../lib/format";

const NAV = [
  { to: "/explore", label: "Explore" },
  { to: "/live", label: "Live" },
  { to: "/launch", label: "Launch" },
  { to: "/mm", label: "Any coin" },
  { to: "/token", label: "$MAKERS" },
  { to: "/burn", label: "Burn" },
  { to: "/crown", label: "Crown" },
  { to: "/docs", label: "Docs" },
];

export default function Header() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { session, signedIn, signIn, signOut, status } = useAuth();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    nav(`/explore?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07111f]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="logo-link">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#8AF5D0] font-mono text-sm font-bold text-[#07111f]">M</span>
          <span className="text-[17px] font-medium tracking-tight text-white">makers<span className="text-[#8AF5D0]">.</span></span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-4" data-testid="main-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.label.replace(/[^a-z]/gi, "").toLowerCase()}`}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#8AF5D0] text-[#07111f] font-medium"
                    : "text-[#8ca3b8] hover:text-white hover:bg-white/5"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <form onSubmit={submitSearch} className="hidden md:block">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#556b82]" />
              <input
                id="global-search"
                data-testid="global-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search makers"
                className="h-9 w-44 lg:w-52 rounded-full border border-white/10 bg-white/5 pl-9 pr-10 text-[13px] text-white placeholder-[#556b82] outline-none focus:border-[#8AF5D0]/40 transition-colors"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1 font-mono text-[10px] text-[#556b82]">⌘K</kbd>
            </div>
          </form>

          {connected && publicKey ? (
            <div className="relative" ref={menuRef}>
              <button
                data-testid="wallet-chip"
                onClick={() => setMenu((m) => !m)}
                className="flex h-9 items-center gap-2 rounded-full border border-[#8AF5D0]/30 bg-[#8AF5D0]/10 px-4 font-mono text-xs text-[#8AF5D0] hover:bg-[#8AF5D0]/20 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#8AF5D0]" />
                {short(publicKey.toBase58())}
                {signedIn && <KeyRound size={12} />}
              </button>
              {menu && (
                <div className="absolute right-0 top-11 w-56 rounded-xl border border-white/10 bg-[#0d1b2a] p-1.5 shadow-2xl" data-testid="wallet-menu">
                  {!signedIn && (
                    <button
                      data-testid="wallet-signin-btn"
                      onClick={async () => { setMenu(false); try { await signIn(); } catch { /* surfaced via toast elsewhere */ } }}
                      disabled={status === "signing" || status === "verifying"}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-[#8AF5D0] hover:bg-white/5"
                    >
                      <KeyRound size={14} /> {status === "idle" || status === "failed" ? "Sign in your wallet" : "Signing…"}
                    </button>
                  )}
                  <Link to="/dashboard" onClick={() => setMenu(false)} data-testid="wallet-mymakers-link"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#8ca3b8] hover:bg-white/5 hover:text-white">
                    <LayoutDashboard size={14} /> Your makers
                  </Link>
                  {signedIn && (
                    <button onClick={async () => { setMenu(false); await signOut(); }} data-testid="wallet-signout-btn"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#8ca3b8] hover:bg-white/5 hover:text-white">
                      <LogOut size={14} /> Sign out
                    </button>
                  )}
                  <button onClick={() => { setMenu(false); disconnect(); }} data-testid="wallet-disconnect-btn"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#8ca3b8] hover:bg-white/5 hover:text-white">
                    <Wallet size={14} /> Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              data-testid="connect-wallet-btn"
              onClick={() => setVisible(true)}
              className="flex h-9 items-center gap-2 rounded-full bg-[#8AF5D0] px-4 text-[13px] font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_20px_rgba(138,245,208,0.35)] transition-all"
            >
              <Wallet size={14} /> Connect
            </button>
          )}
        </div>
      </div>

      <nav className="flex lg:hidden items-center gap-1 overflow-x-auto px-4 pb-2" data-testid="main-nav-mobile">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-full px-3 py-1 text-xs ${isActive ? "bg-[#8AF5D0] text-[#07111f]" : "text-[#8ca3b8]"}`
            }>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
