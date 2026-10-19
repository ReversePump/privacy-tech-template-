import React from "react";
import { Link, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/strategies", label: "Strategies" },
  { to: "/traders", label: "Traders" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/revenue", label: "Revenue" },
];

export default function Header() {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b border-[#12121414] bg-[#faf9f7f2] backdrop-blur-md" data-testid="header">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 md:px-6">
        <Link to="/" className="serif text-[22px] font-medium tracking-tight text-[#121214]" data-testid="logo-link">
          Weft<span className="text-[#2b59ff]">.</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5" data-testid="main-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-[13px] text-[#75777d] hover:text-[#121214] transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href="https://x.com/weftfinance" target="_blank" rel="noopener noreferrer" data-testid="header-x-link"
            className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#12121414] text-[#75777d] hover:text-[#121214] transition-colors">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <button
            onClick={() => nav("/new")}
            data-testid="header-start-btn"
            className="h-9 rounded-full bg-[#121214] px-4 text-[13px] font-medium text-white hover:bg-[#2b59ff] transition-colors"
          >
            Start trading
          </button>
        </div>
      </div>
      <nav className="flex md:hidden items-center gap-4 overflow-x-auto px-4 pb-2.5" data-testid="main-nav-mobile">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="whitespace-nowrap text-[12px] text-[#75777d]">{n.label}</Link>
        ))}
      </nav>
    </header>
  );
}
