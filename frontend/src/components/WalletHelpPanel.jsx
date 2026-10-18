import React, { useState } from "react";
import { Copy, Check, ExternalLink, MonitorSmartphone } from "lucide-react";

// Shown when a wallet (Phantom) hard-blocks the SIWS sign-in on a custom domain.
export default function WalletHelpPanel() {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;
  const origin = window.location.origin;
  return (
    <div className="rounded-[3px] border border-[#a8780f]/30 bg-[#a8780f]/5 p-5" data-testid="wallet-help-panel">
      <div className="flex items-center gap-2 text-[#a8780f]">
        <MonitorSmartphone size={16} />
        <span className="text-sm font-medium text-[#131a0f]">This wallet blocks cross-domain sign-in</span>
      </div>
      <p className="mt-2 text-[12px] font-light leading-relaxed text-[#3a4a33]">
        Phantom refuses to display sign-in messages issued under another domain — a wallet-side security rule we can't override. Browsing, exploring and watching live data need no sign-in. To launch or manage a maker, use one of these:
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={`https://solflare.com/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`}
          data-testid="wallet-help-solflare"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] bg-[#3F9E00] px-4 text-[13px] font-medium text-white hover:bg-[#54C400] transition-colors"
        >
          <ExternalLink size={14} /> Open in Solflare's browser
        </a>
        <button
          data-testid="wallet-help-copy"
          onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-black/15 px-4 text-[13px] text-[#131a0f] hover:border-[#3F9E00]/40 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Link copied" : "Copy link for another wallet browser"}
        </button>
        <div className="text-center font-mono text-[10px] uppercase tracking-wider text-[#93a184]">
          or open {origin.replace("https://", "")} on desktop with Phantom
        </div>
      </div>
    </div>
  );
}
