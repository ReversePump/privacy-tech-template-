import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[#12121414]" data-testid="footer">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
          <div>
            <div className="serif text-2xl font-medium">Weft<span className="text-[#2b59ff]">.</span></div>
            <p className="mt-2 max-w-xs text-[13px] text-[#75777d]">
              Trade the thesis. Write a market view in plain English; it becomes rules you can read, traded from your own account.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-[13px]">
            <Link to="/new" className="text-[#75777d] hover:text-[#121214]">New strategy</Link>
            <Link to="/strategies" className="text-[#75777d] hover:text-[#121214]">Strategies</Link>
            <Link to="/traders" className="text-[#75777d] hover:text-[#121214]">Traders</Link>
            <Link to="/leaderboard" className="text-[#75777d] hover:text-[#121214]">Leaderboard</Link>
            <Link to="/revenue" className="text-[#75777d] hover:text-[#121214]">Revenue</Link>
            <a href="https://x.com/weftfinance" target="_blank" rel="noopener noreferrer" className="text-[#75777d] hover:text-[#121214]">@weftfinance</a>
          </div>
        </div>
        <div className="mt-10 border-t border-[#12121414] pt-6 text-[11px] text-[#75777d] leading-relaxed">
          Not financial advice. Trading involves risk, including loss of principal. Past backtests do not guarantee future results.
        </div>
      </div>
    </footer>
  );
}
