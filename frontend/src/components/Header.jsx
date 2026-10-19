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
    <header className="sticky top-0 z-40 border-b border-[#ffffff26] bg-[#17171bf2] backdrop-blur-md" data-testid="header">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2.5" data-testid="logo-link">
          <img src="/logo.png" alt="Loom" className="h-8 w-8 rounded-lg border border-[#ffffff40] object-cover" />
          <span className="serif text-[20px] font-semibold uppercase tracking-[0.22em] text-[#f4f4f5]">Loom</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5" data-testid="main-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-[13px] text-[#9aa0ae] hover:text-[#f4f4f5] transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" data-testid="header-x-link"
            className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffffff26] text-[#9aa0ae] hover:text-[#cbd5e1] hover:border-[#ffffff59] transition-colors">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <button
            onClick={onAccount}
            data-testid="header-account-btn"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffffff26] bg-[#17171b] px-4 text-[13px] text-[#f4f4f5] hover:border-[#ffffff59] transition-colors"
          >
            {signedIn ? <LayoutDashboard size={13} /> : <Wallet size={13} />}
            {signedIn ? "Account" : connected ? "Sign in" : "Connect"}
          </button>
          <button
            onClick={() => nav("/new")}
            data-testid="header-start-btn"
            className="h-9 rounded-full bg-[#e5e7eb] px-4 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] transition-colors"
          >
            Start trading
          </button>
        </div>
      </div>
      <nav className="flex md:hidden items-center gap-4 overflow-x-auto px-4 pb-2.5" data-testid="main-nav-mobile">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="whitespace-nowrap text-[12px] text-[#9aa0ae]">{n.label}</Link>
        ))}
      </nav>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
