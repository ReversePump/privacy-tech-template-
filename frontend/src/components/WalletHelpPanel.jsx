import React, { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, MonitorSmartphone } from "lucide-react";
import QRCode from "qrcode";

// Shown when a wallet (Phantom) hard-blocks the SIWS sign-in on a custom domain.
export default function WalletHelpPanel() {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(null);
  const url = window.location.href;
  const origin = window.location.origin;

  useEffect(() => {
    QRCode.toDataURL(origin, { margin: 1, width: 132, color: { dark: "#131a0f", light: "#ffffff" } })
      .then(setQr)
      .catch(() => {});
  }, [origin]);

  return (
    <div className="rounded-[3px] border border-[#a8780f]/30 bg-[#a8780f]/5 p-5" data-testid="wallet-help-panel">
      <div className="flex items-center gap-2 text-[#a8780f]">
        <MonitorSmartphone size={16} />
        <span className="text-sm font-medium text-[#131a0f]">This wallet blocks cross-domain sign-in</span>
      </div>
      <p className="mt-2 text-[12px] font-light leading-relaxed text-[#3a4a33]">
        Phantom refuses to display sign-in messages issued under another domain — a wallet-side security rule. Browsing and all live data need no sign-in. To launch or run a maker, pick one:
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={`https://solflare.com/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`}
          data-testid="wallet-help-solflare"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] bg-[#3F9E00] px-4 text-[13px] font-medium text-white hover:bg-[#54C400] transition-colors"
        >
          <ExternalLink size={14} /> Open this page in Solflare's browser
        </a>
        <button
          data-testid="wallet-help-copy"
          onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-black/15 px-4 text-[13px] text-[#131a0f] hover:border-[#3F9E00]/40 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Link copied" : "Copy link for another wallet browser"}
        </button>
        {qr && (
          <div className="mt-2 flex items-center gap-4 rounded-[3px] border border-black/10 bg-white p-3" data-testid="wallet-help-qr">
            <img src={qr} alt="Open on desktop" width={96} height={96} style={{ imageRendering: "pixelated" }} />
            <div>
              <div className="text-[13px] font-medium text-[#131a0f]">Rather use a computer?</div>
              <p className="mt-1 text-[11px] font-light leading-relaxed text-[#5c6b50]">
                Scan with your phone camera to open {origin.replace("https://", "")} on desktop — Phantom's browser extension allows the sign-in there.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
