import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { LayoutDashboard, Wallet } from "lucide-react";
import { useAuth } from "../solana/AuthContext";
import AuthModal from "./AuthModal";

const NAV = [
  { to: "/strategies", label: "Strategies" },
  { to: "/traders", label: "Traders" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/revenue", label: "Revenue" },
];

export default function Header() {
  const nav = useNavigate();
  const { connected } = useWallet();
  const { signedIn } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const onAccount = () => {
    if (signedIn) { nav("/account"); return; }
    setAuthOpen(true);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#a855f724] bg-[#171428f2] backdrop-blur-md" data-testid="header">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2.5" data-testid="logo-link">
          <img src="/logo.png" alt="Loom" className="h-8 w-8 rounded-lg border border-[#a855f73d] object-cover" />
          <span className="serif text-[20px] font-semibold uppercase tracking-[0.22em] text-[#f3f0fd]">Loom</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5" data-testid="main-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-[13px] text-[#a89ec4] hover:text-[#f3f0fd] transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" data-testid="header-x-link"
            className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#a855f724] text-[#a89ec4] hover:text-[#c084fc] hover:border-[#a855f755] transition-colors">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <button
            onClick={onAccount}
            data-testid="header-account-btn"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#a855f724] bg-[#171428] px-4 text-[13px] text-[#f3f0fd] hover:border-[#a855f755] transition-colors"
          >
            {signedIn ? <LayoutDashboard size={13} /> : <Wallet size={13} />}
            {signedIn ? "Account" : connected ? "Sign in" : "Connect"}
          </button>
          <button
            onClick={() => nav("/new")}
            data-testid="header-start-btn"
            className="h-9 rounded-full bg-[#9333ea] px-4 text-[13px] font-medium text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:bg-[#a855f7] transition-colors"
          >
            Start trading
          </button>
        </div>
      </div>
      <nav className="flex md:hidden items-center gap-4 overflow-x-auto px-4 pb-2.5" data-testid="main-nav-mobile">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="whitespace-nowrap text-[12px] text-[#a89ec4]">{n.label}</Link>
        ))}
      </nav>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
