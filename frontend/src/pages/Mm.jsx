import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Search, Check, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { fmtUsd, fmtSol, short } from "../lib/format";
import { PageHead, Panel, CoinAvatar, Loading } from "../components/bits";
import { useAuth } from "../solana/AuthContext";

export default function Mm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // checkCoin response
  const [fundSol, setFundSol] = useState(1);
  const [config, setConfig] = useState(null);
  const [preset, setPreset] = useState("balanced");
  const [settings, setSettings] = useState({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // created desk
  const [depositState, setDepositState] = useState("idle"); // idle|sending|done|failed
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { signedIn, signIn } = useAuth();

  useEffect(() => {
    makers.config().then((c) => {
      setConfig(c);
      setSettings(c?.defaults || {});
    }).catch(() => {});
  }, []);

  const extractMint = (v) => {
    const m = v.trim().match(/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})(?:[?/].*)?$/);
    return m ? m[1] : null;
  };

  const check = async (raw) => {
    const mint = extractMint(raw ?? input);
    if (!mint) { toast.error("Paste the coin's link or a mint address"); return; }
    setChecking(true);
    setResult(null);
    setCreated(null);
    try {
      const r = await makers.checkCoin(mint);
      setResult(r);
      nav(`/mm?mint=${encodeURIComponent(r.mint)}`, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setChecking(false); }
  };

  useEffect(() => {
    const m = params.get("mint");
    if (m && !result) { setInput(m); check(m); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPreset = (key) => {
    setPreset(key);
    const p = config?.presets?.[key];
    if (p?.values) setSettings((s) => ({ ...s, ...p.values, preset: key }));
  };

  const settingsDiff = useMemo(() => {
    const base = config?.defaults || {};
    return Object.fromEntries(Object.entries(settings).filter(([k, v]) => v !== base[k] && v !== null && typeof v !== "object"));
  }, [settings, config]);

  const treasuryAddress = (d) =>
    d?.treasury?.address || d?.desk?.treasury?.address ||
    (typeof d?.treasury === "string" ? d.treasury : null) ||
    (d?.wallets || d?.desk?.wallets || []).find((w) => w.role === "treasury")?.address || null;

  const deposit = async (desk, sol) => {
    const addr = treasuryAddress(desk);
    if (!addr) { toast.warning("Treasury address not in the response — deposit from the desk page."); return; }
    if (!sol || sol <= 0) return;
    setDepositState("sending");
    try {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(addr),
        lamports: Math.round(sol * LAMPORTS_PER_SOL),
      }));
      const sig = await sendTransaction(tx, connection);
      setDepositState("done");
      toast.success(`Deposited ${sol} SOL`, { description: `Signature ${short(sig)}. The treasury funds the wallets within two minutes.` });
    } catch (e) {
      setDepositState("failed");
      toast.error(`Deposit failed: ${errorMessage(e)}`);
    }
  };

  const add = async () => {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!result?.ok) { toast.error("Check a coin first"); return; }
    setBusy(true);
    try {
      if (!signedIn) await signIn();
      const res = await makers.createDesk(result.mint, settingsDiff);
      const desk = res?.desk || res;
      setCreated(desk);
      toast.success(`Maker created for $${desk.ticker || result.ticker}`, { description: "Deposit SOL to its treasury to start trading." });
      await deposit(desk, fundSol);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const presets = config?.presets ? Object.entries(config.presets) : [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="mm-page">
      <PageHead
        kicker="Onboard"
        title="Bring your"
        accent="own coin."
        sub="Drop in any coin — link or mint — and it gets its own market maker, same as the coins born here. Every wallet and fill publicly auditable."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        <div className="space-y-6">
          <Panel className="p-6" data-testid="mm-check-panel">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">1 · Which coin?</div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Coin link or mint</label>
            <div className="flex gap-2">
              <input
                data-testid="mm-mint-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && check()}
                placeholder="https://…/coin/… or the mint address"
                className="h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-[13px] text-white outline-none focus:border-[#8AF5D0]/40"
              />
              <button onClick={() => check()} disabled={checking} data-testid="mm-check-btn"
                className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-5 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-50">
                {checking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {checking ? "Checking…" : "Check"}
              </button>
            </div>

            {result && !result.ok && (
              <div className="mt-5 rounded-xl border border-[#ff4d4f]/25 bg-[#ff4d4f]/5 p-4" data-testid="mm-check-failed">
                <div className="flex items-center gap-3">
                  <CoinAvatar url={result.imageUrl} name={result.name} size={36} />
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{result.name || "This coin"} <span className="font-mono text-[11px] text-[#556b82]">${result.ticker || "?"}</span></div>
                    <div className="font-mono text-[11px] text-[#556b82]">{short(result.mint, 6, 6)}</div>
                  </div>
                </div>
                <p className="mt-3 text-[12px] text-[#ff8a8a]">{result.reason || "This coin cannot take a maker."}</p>
                {result.desks?.length > 0 && (
                  <p className="mt-2 text-[12px] text-[#8ca3b8]">
                    It already has a maker: <Link className="text-[#8AF5D0] hover:underline" to={`/desk/${result.desks[0].id}`}>open it →</Link>
                  </p>
                )}
              </div>
            )}

            {result?.ok && (
              <div className="mt-5 rounded-xl border border-[#8AF5D0]/20 bg-[#8AF5D0]/5 p-4" data-testid="mm-check-result">
                <div className="flex items-center gap-3">
                  <CoinAvatar url={result.imageUrl} name={result.name} size={40} />
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{result.name || "Unknown coin"} <span className="font-mono text-[11px] text-[#556b82]">${result.ticker || "?"}</span></div>
                    <div className="font-mono text-[11px] text-[#556b82]">{short(result.mint, 6, 6)} · {fmtUsd(result.market?.mcapUsd)}</div>
                  </div>
                  <Check size={18} className="ml-auto text-[#8AF5D0]" />
                </div>
              </div>
            )}
          </Panel>

          {created && (
            <Panel className="border-[#8AF5D0]/30 bg-[#8AF5D0]/5 p-6" data-testid="mm-created">
              <div className="flex items-center gap-2 text-[#8AF5D0]"><Check size={18} /><span className="font-medium">Maker created.</span></div>
              <p className="mt-2 text-[13px] font-light text-[#8ca3b8]">
                {depositState === "done" ? "Treasury funded — the wallets start trading within two minutes."
                  : depositState === "sending" ? "Approve the deposit in your wallet…"
                  : "Deposit SOL to its treasury to start trading."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={`/desk/${created.id}`} className="rounded-[3px] bg-[#8AF5D0] px-5 py-2 text-sm font-medium text-[#07111f]" data-testid="mm-open-desk">Open the maker →</Link>
                {depositState === "failed" && (
                  <button onClick={() => deposit(created, fundSol)} className="rounded-[3px] border border-white/15 px-5 py-2 text-sm text-white" data-testid="mm-retry-deposit">
                    Retry deposit
                  </button>
                )}
              </div>
            </Panel>
          )}
        </div>

        <Panel className="p-6 self-start" data-testid="mm-config-panel">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">2 · Maker setup</div>
          <div className="mt-5">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Fund the maker (SOL)</label>
            <input type="number" min={0} step={0.1} value={fundSol} data-testid="mm-fund-input"
              onChange={(e) => setFundSol(Number(e.target.value) || 0)}
              className="h-11 w-48 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />
            <p className="mt-2 text-[11px] font-light text-[#556b82]">
              Onboarded coins have no locked fee split — the maker trades with whatever you deposit into its vault.
            </p>
          </div>

          {presets.length > 0 && (
            <div className="mt-5">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Strategy preset</label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map(([key, p]) => (
                  <button key={key} data-testid={`mm-preset-${key}`} onClick={() => pickPreset(key)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${preset === key ? "border-[#8AF5D0]/50 bg-[#8AF5D0]/5" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}>
                    <div className="text-white text-[13px] font-medium">{p.name}</div>
                    <div className="mt-0.5 text-[10px] font-light leading-snug text-[#556b82]">{p.summary}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-6 space-y-2 border-t border-white/5 pt-4 text-[12px] font-light text-[#8ca3b8]">
            <li>· Starts on the Balanced temperament — retune every dial afterwards.</li>
            <li>· All wallets public, every fill on its page.</li>
            <li>· Your wallet alone can pause, resume or withdraw.</li>
          </ul>
          {!created && (
            <button onClick={add} disabled={!result?.ok || busy} data-testid="mm-add-btn"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-40 transition-all">
              {connected ? (busy ? "Creating…" : "Create the maker") : "Connect to add"} <ArrowRight size={14} />
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
}
