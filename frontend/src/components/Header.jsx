import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Search, Wallet, LogOut, LayoutDashboard, KeyRound, Plus, Rocket, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "../lib/api";
import { useAuth } from "../solana/AuthContext";
import { short } from "../lib/format";
import { SubPrice } from "./bits";

const NAV = [
  { to: "/explore", label: "Explore" },
  { to: "/live", label: "Live" },
  { to: "/docs", label: "Docs" },
];

const PLATFORM_CA = "7UMdnRcC9zXp1wm9MteFCEJ785bk8xpfWPgdcAghpump";

export default function Header() {
  const { publicKey, connected, disconnect, wallets } = useWallet();
  const { setVisible } = useWalletModal();
  const { session, signedIn, signIn, signOut, status } = useAuth();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [copiedCa, setCopiedCa] = useState(false);
  const [marketsPrice, setMarketsPrice] = useState(null);
  const nav = useNavigate();
  const menuRef = useRef(null);

  // live $MARKETS price for the header pill (from the token's own CA)
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/markets/prices?mint=${PLATFORM_CA}&range=1h`)
        .then((r) => r.json())
        .then((d) => live && setMarketsPrice(d?.last ?? null))
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const copyCa = () => {
    navigator.clipboard?.writeText(PLATFORM_CA);
    setCopiedCa(true);
    toast.success("CA copied to clipboard");
    setTimeout(() => setCopiedCa(false), 1500);
  };

  // On mobile with no injected/detected wallet, open the site inside a wallet's browser instead.
  const connect = () => {
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const detected = (wallets || []).some((w) => w.readyState === "Installed" || w.readyState === "Loadable");
    if (isMobile && !window.solana && !detected) {
      const url = encodeURIComponent(window.location.href);
      const ref = encodeURIComponent(window.location.origin);
      window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
      return;
    }
    setVisible(true);
  };

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
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fbfdf7]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="logo-link">
          <img src="/logo.png" alt="MakeMarkets" className="h-8 w-auto" style={{ imageRendering: "pixelated" }} />
          <span className="text-[17px] font-medium tracking-tight text-[#131a0f]">Make<span className="text-[#3F9E00]">Markets</span></span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-4" data-testid="main-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.label.replace(/[^a-z]/gi, "").toLowerCase()}`}
              className={({ isActive }) =>
                `rounded-[3px] px-3.5 py-1.5 text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#3F9E00] text-[#131a0f] font-medium"
                    : "text-[#5c6b50] hover:text-[#131a0f] hover:bg-black/5"
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
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#93a184]" />
              <input
                id="global-search"
                data-testid="global-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search makers"
                className="h-9 w-44 lg:w-52 rounded-[3px] border border-black/10 bg-black/5 pl-9 pr-10 text-[13px] text-[#131a0f] placeholder-[#93a184] outline-none focus:border-[#3F9E00]/40 transition-colors"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-black/10 px-1 font-mono text-[10px] text-[#93a184]">⌘K</kbd>
            </div>
          </form>

          <Link to="/mm" data-testid="header-onboard-btn"
            className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-black/15 px-4 text-[13px] text-[#3a4a33] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] transition-colors">
            <Plus size={14} /> Onboard
          </Link>
          <Link to="/launch" data-testid="header-launch-btn"
            className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[#131a0f] px-4 text-[13px] font-medium text-white hover:bg-[#3F9E00] transition-colors">
            <Rocket size={14} /> Launch
          </Link>

          <button onClick={copyCa} data-testid="header-ca" title={PLATFORM_CA}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-black/10 bg-black/[0.03] px-2.5 md:px-3 font-mono text-[10px] md:text-[11px] text-[#5c6b50] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] transition-colors">
            <span className="font-medium text-[#131a0f]">$MARKETS</span>
            {marketsPrice != null && (
              <span className="hidden sm:inline text-[#3F9E00] tnum" data-testid="header-ca-price"><SubPrice value={marketsPrice} /></span>
            )}
            <span className="text-[#93a184]">{copiedCa ? "Copied" : short(PLATFORM_CA, 4, 4)}</span>
            {copiedCa ? <Check size={12} className="text-[#3F9E00]" /> : <Copy size={12} />}
          </button>

          <a href="https://x.com/usemakemarkets" target="_blank" rel="noopener noreferrer" data-testid="header-x-link"
            aria-label="MakeMarkets on X"
            className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-black/10 text-[#5c6b50] hover:text-[#131a0f] hover:border-black/25 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>

          {connected && publicKey ? (
            <div className="relative" ref={menuRef}>
              <button
                data-testid="wallet-chip"
                onClick={() => setMenu((m) => !m)}
                className="flex h-9 items-center gap-2 rounded-[3px] border border-[#3F9E00]/30 bg-[#3F9E00]/10 px-4 font-mono text-xs text-[#3F9E00] hover:bg-[#3F9E00]/20 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-[3px] bg-[#3F9E00]" />
                {short(publicKey.toBase58())}
                {signedIn && <KeyRound size={12} />}
              </button>
              {menu && (
                <div className="absolute right-0 top-11 w-56 rounded-xl border border-black/10 bg-white p-1.5 shadow-2xl" data-testid="wallet-menu">
                  {!signedIn && (
                    <button
                      data-testid="wallet-signin-btn"
                      onClick={async () => { setMenu(false); try { await signIn(); } catch (e) { toast.error(errorMessage(e)); } }}
                      disabled={status === "signing" || status === "verifying"}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-[#3F9E00] hover:bg-black/5"
                    >
                      <KeyRound size={14} /> {status === "idle" || status === "failed" ? "Sign in your wallet" : "Signing…"}
                    </button>
                  )}
                  <Link to="/dashboard" onClick={() => setMenu(false)} data-testid="wallet-mymakers-link"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#5c6b50] hover:bg-black/5 hover:text-[#131a0f]">
                    <LayoutDashboard size={14} /> Your makers
                  </Link>
                  {signedIn && (
                    <button onClick={async () => { setMenu(false); await signOut(); }} data-testid="wallet-signout-btn"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#5c6b50] hover:bg-black/5 hover:text-[#131a0f]">
                      <LogOut size={14} /> Sign out
                    </button>
                  )}
                  <button onClick={() => { setMenu(false); disconnect(); }} data-testid="wallet-disconnect-btn"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#5c6b50] hover:bg-black/5 hover:text-[#131a0f]">
                    <Wallet size={14} /> Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              data-testid="connect-wallet-btn"
              onClick={connect}
              className="flex h-9 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-4 text-[13px] font-medium text-[#131a0f] hover:bg-[#54C400] hover:shadow-[0_0_20px_rgba(92,225,0,0.35)] transition-all"
            >
              <Wallet size={14} /> Connect
            </button>
          )}
        </div>
      </div>

      <nav className="flex lg:hidden items-center gap-1 overflow-x-auto px-4 pb-2" data-testid="main-nav-mobile">
        {[...NAV, { to: "/mm", label: "Onboard" }, { to: "/launch", label: "Launch" }].map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-[3px] px-3 py-1 text-xs ${isActive ? "bg-[#3F9E00] text-[#131a0f]" : "text-[#5c6b50]"}`
            }>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
