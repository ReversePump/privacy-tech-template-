import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-black/5 mt-20">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="MakeMarkets" className="h-8 w-auto" style={{ imageRendering: "pixelated" }} />
              <span className="text-[17px] font-medium tracking-tight text-[#131a0f]">Make<span className="text-[#3F9E00]">Markets</span></span>
            </div>
            <p className="mt-3 max-w-sm text-[13px] font-light leading-relaxed text-[#93a184]">
              Market makers for every coin. They buy the dips, sell the rips, and run on the coin's own fees. Market making can lose money.
            </p>
          </div>
          <div className="flex gap-14 font-mono text-xs">
            <div className="flex flex-col gap-2.5">
              <span className="uppercase tracking-[0.15em] text-[#93a184]">Platform</span>
              <Link className="text-[#5c6b50] hover:text-[#3F9E00]" to="/explore">Explore</Link>
              <Link className="text-[#5c6b50] hover:text-[#3F9E00]" to="/launch">Launch</Link>
              <Link className="text-[#5c6b50] hover:text-[#3F9E00]" to="/mm">Onboard a coin</Link>
              <Link className="text-[#5c6b50] hover:text-[#3F9E00]" to="/live">Live</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="uppercase tracking-[0.15em] text-[#93a184]">Learn</span>
              <Link className="text-[#5c6b50] hover:text-[#3F9E00]" to="/docs">Docs</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-black/5 pt-5 font-mono text-[11px] text-[#93a184]">
          All wallets public · a maker's wallets never fill each other · market making can lose money
        </div>
      </div>
    </footer>
  );
}
