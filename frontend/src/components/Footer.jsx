import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 mt-20">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#8AF5D0] font-mono text-sm font-bold text-[#07111f]">M</span>
              <span className="text-[17px] font-medium tracking-tight text-white">Make<span className="text-[#8AF5D0]">Markets</span></span>
            </div>
            <p className="mt-3 max-w-sm text-[13px] font-light leading-relaxed text-[#556b82]">
              Market makers for every coin. They buy the dips, sell the rips, and run on the coin's own fees. Market making can lose money.
            </p>
          </div>
          <div className="flex gap-14 font-mono text-xs">
            <div className="flex flex-col gap-2.5">
              <span className="uppercase tracking-[0.15em] text-[#556b82]">Platform</span>
              <Link className="text-[#8ca3b8] hover:text-[#8AF5D0]" to="/explore">Explore</Link>
              <Link className="text-[#8ca3b8] hover:text-[#8AF5D0]" to="/launch">Launch</Link>
              <Link className="text-[#8ca3b8] hover:text-[#8AF5D0]" to="/mm">Any coin</Link>
              <Link className="text-[#8ca3b8] hover:text-[#8AF5D0]" to="/live">Live</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="uppercase tracking-[0.15em] text-[#556b82]">Learn</span>
              <Link className="text-[#8ca3b8] hover:text-[#8AF5D0]" to="/docs">Docs</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="uppercase tracking-[0.15em] text-[#556b82]">Chain</span>
              <a className="text-[#8ca3b8] hover:text-[#8AF5D0]" href="https://pump.fun" target="_blank" rel="noopener noreferrer">pump.fun</a>
              <a className="text-[#8ca3b8] hover:text-[#8AF5D0]" href="https://solscan.io" target="_blank" rel="noopener noreferrer">Solscan</a>
              <a className="text-[#8ca3b8] hover:text-[#8AF5D0]" href="https://dexscreener.com/solana" target="_blank" rel="noopener noreferrer">DexScreener</a>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/5 pt-5 font-mono text-[11px] text-[#556b82]">
          All wallets public · a maker's wallets never fill each other · market making can lose money
        </div>
      </div>
    </footer>
  );
}
