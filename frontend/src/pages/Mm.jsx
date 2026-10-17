import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Search, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { fmtUsd, short } from "../lib/format";
import { PageHead, Panel, CoinAvatar, Loading } from "../components/bits";
import { useAuth } from "../solana/AuthContext";

export default function Mm() {
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [fundSol, setFundSol] = useState(1);
  const [busy, setBusy] = useState(false);
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { signedIn, signIn } = useAuth();

  const extractMint = (v) => {
    const m = v.trim().match(/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/);
    return m ? m[1] : null;
  };

  const check = async () => {
    const mint = extractMint(input);
    if (!mint) { toast.error("Paste a pump.fun link or a mint address"); return; }
    setChecking(true);
    setResult(null);
    try {
      const r = await makers.checkCoin(mint);
      setResult({ mint, ...r });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setChecking(false); }
  };

  const add = async () => {
    if (!connected) { setVisible(true); return; }
    setBusy(true);
    try {
      if (!signedIn) await signIn();
      const res = await makers.createDesk(result.mint, { fundSol });
      toast.success("Maker created.", { description: "It starts trading once its treasury has SOL." });
      const deskId = res?.desk?.id || res?.id;
      if (deskId) window.location.href = `/desk/${deskId}`;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="mm-page">
      <PageHead
        kicker="Any coin"
        title="Put a maker on"
        accent="any coin."
        sub="Paste any pump.fun coin — link or mint — and it gets the same market maker the coins launched here get. Its page lists every wallet and every trade."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        <Panel className="p-6" data-testid="mm-check-panel">
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">pump.fun link or mint</label>
          <div className="flex gap-2">
            <input
              data-testid="mm-mint-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="https://pump.fun/coin/… or mint address"
              className="h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-[13px] text-white outline-none focus:border-[#8AF5D0]/40"
            />
            <button onClick={check} disabled={checking} data-testid="mm-check-btn"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#8AF5D0] px-5 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-50">
              <Search size={14} /> {checking ? "Checking…" : "Check"}
            </button>
          </div>

          {checking && <Loading label="Checking the coin" />}
          {result && (
            <div className="mt-6 rounded-xl border border-[#8AF5D0]/20 bg-[#8AF5D0]/5 p-4" data-testid="mm-check-result">
              <div className="flex items-center gap-3">
                <CoinAvatar url={result.imageUrl} name={result.name} size={40} />
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{result.name || "Unknown coin"} <span className="font-mono text-[11px] text-[#556b82]">${result.ticker || "?"}</span></div>
                  <div className="font-mono text-[11px] text-[#556b82]">{short(result.mint, 6, 6)} · {fmtUsd(result.mcapUsd ?? result.market?.mcapUsd)}</div>
                </div>
                <Check size={18} className="ml-auto text-[#8AF5D0]" />
              </div>
              {result.eligible === false && (
                <p className="mt-3 text-[12px] text-[#ff8a8a]">{result.reason || "This coin cannot take a maker."}</p>
              )}
            </div>
          )}
        </Panel>

        <Panel className="p-6" data-testid="mm-config-panel">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">Maker setup</div>
          <div className="mt-5">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Fund the maker (SOL)</label>
            <input type="number" min={0} step={0.1} value={fundSol} data-testid="mm-fund-input"
              onChange={(e) => setFundSol(Number(e.target.value) || 0)}
              className="h-11 w-48 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />
            <p className="mt-2 text-[11px] font-light text-[#556b82]">
              Coins not launched here have no locked reward split — the maker trades with what you fund it with.
            </p>
          </div>
          <ul className="mt-6 space-y-2 border-t border-white/5 pt-4 text-[12px] font-light text-[#8ca3b8]">
            <li>· Starts on the Balanced preset; tune every number after.</li>
            <li>· Every wallet public, every trade on its page.</li>
            <li>· Only your wallet can pause, resume, or withdraw.</li>
          </ul>
          <button onClick={add} disabled={!result || busy} data-testid="mm-add-btn"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-40 transition-all">
            {connected ? (busy ? "Creating…" : "Add the maker") : "Connect to add"} <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
    </div>
  );
}
