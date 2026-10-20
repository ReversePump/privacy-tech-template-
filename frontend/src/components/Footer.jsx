import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[#ffffff26]" data-testid="footer">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Loom" className="h-8 w-8 object-contain" />
              <span className="serif text-xl font-semibold uppercase tracking-[0.22em] text-[#f4f4f5]">Loom</span>
            </div>
            <p className="mt-2 max-w-xs text-[13px] text-[#9aa0ae]">
              Your strategy. Automatically executed. Write a market view in plain English; it becomes rules you can read, traded from your own account.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-[13px]">
            <Link to="/new" className="text-[#9aa0ae] hover:text-[#f4f4f5]">New strategy</Link>
            <Link to="/strategies" className="text-[#9aa0ae] hover:text-[#f4f4f5]">Strategies</Link>
            <Link to="/markets" className="text-[#9aa0ae] hover:text-[#f4f4f5]">Markets</Link>
            <Link to="/terms" className="text-[#9aa0ae] hover:text-[#f4f4f5]">Terms</Link>
            <Link to="/privacy" className="text-[#9aa0ae] hover:text-[#f4f4f5]">Privacy</Link>
            <Link to="/risk" className="text-[#9aa0ae] hover:text-[#f4f4f5]">Risk disclosure</Link>
            <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" className="text-[#9aa0ae] hover:text-[#cbd5e1]">X</a>
          </div>
        </div>
        <div className="mt-10 border-t border-[#ffffff26] pt-6 text-[11px] text-[#9aa0ae] leading-relaxed">
          Not financial advice. Trading involves risk, including loss of principal. Past backtests do not guarantee future results.
        </div>
      </div>
    </footer>
  );
}
