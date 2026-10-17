import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, Check, Pause, Play, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { makers, errorMessage } from "../lib/api";
import { fmtSol, fmtSolSigned, fmtUsd, fmtNum, fmtAge, fmtPct, short, lamportsToSol, solscanAcct, solscanTx, pumpCoin, dexscreener } from "../lib/format";
import { Panel, Stat, CoinAvatar, StatusDot, TypeBadge, SubPrice, Loading, ExtLink, Empty, KindPill } from "../components/bits";
import { useAuth } from "../solana/AuthContext";
import DeskChart from "../components/DeskChart";

const stratLine = (s) => {
  if (!s) return "";
  const parts = [];
  if (s.buyTriggerPct != null) parts.push(`Buys −${s.buyTriggerPct}%`);
  if (s.sellTriggerPct != null) parts.push(`sells +${s.sellTriggerPct}%`);
  if (s.stopLossPct != null) parts.push(`stop −${s.stopLossPct}%`);
  return parts.join(" · ");
};

export default function Desk() {
  const { id } = useParams();
  const [desk, setDesk] = useState(null);
  const [err, setErr] = useState(null);
  const [trades, setTrades] = useState(null);
  const [copied, setCopied] = useState(null);
  const { publicKey } = useWallet();
  const { signedIn, signIn } = useAuth();
  const [acting, setActing] = useState("");

  const load = () =>
    makers.desk(id).then(setDesk).catch((e) => setErr(errorMessage(e)));

  useEffect(() => {
    setDesk(null); setErr(null);
    load();
    makers.trades(id).then((d) => setTrades(d.trades || [])).catch(() => setTrades([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (err) return <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-14"><Empty>{err}</Empty></div>;
  if (!desk) return <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-14"><Loading label="Loading maker" /></div>;

  const t = desk.totals || {};
  const m = desk.market || {};
  const isOwner = desk.isOwner || (publicKey && desk.owner === publicKey.toBase58());

  const copy = (v, k) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1200); };

  const act = async (name, fn) => {
    if (!signedIn) { try { await signIn(); } catch { toast.error("Sign in to manage this maker"); return; } }
    setActing(name);
    try {
      await fn();
      toast.success(`${name} done`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setActing(""); }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-8 md:pt-12" data-testid="desk-page">
      <div className="font-mono text-[11px] uppercase tracking-wider text-[#556b82]">
        <Link to="/explore" className="hover:text-[#8AF5D0]">Explore</Link> / ${desk.ticker}
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        <CoinAvatar url={desk.imageUrl} name={desk.name} size={56} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white">
            {desk.name} <span className="text-lg text-[#556b82] font-light">${desk.ticker}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs text-[#8ca3b8]">
            <StatusDot status={desk.status} />
            <TypeBadge desk={desk} />
            <span>{desk.preset || "custom"} · {desk.walletCount} wallets</span>
            {m.venue && <span>{m.venue === "pool" ? "PumpSwap pool" : "bonding curve"}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[#556b82]">
            <button onClick={() => copy(desk.mint, "mint")} className="inline-flex items-center gap-1 hover:text-[#8AF5D0]" data-testid="desk-copy-mint">
              {copied === "mint" ? <Check size={10} /> : <Copy size={10} />} Mint {short(desk.mint, 4, 4)}
            </button>
            <button onClick={() => copy(desk.owner, "owner")} className="inline-flex items-center gap-1 hover:text-[#8AF5D0]" data-testid="desk-copy-owner">
              {copied === "owner" ? <Check size={10} /> : <Copy size={10} />} Owner {short(desk.owner, 4, 4)}
            </button>
            <span>Launched {fmtAge(desk.launchedAt || desk.createdAt)} ago</span>
            {desk.links?.website && <ExtLink href={desk.links.website}>Website</ExtLink>}
            {desk.links?.x && <ExtLink href={desk.links.x}>X</ExtLink>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExtLink href={pumpCoin(desk.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs">pump.fun</ExtLink>
          <ExtLink href={dexscreener(desk.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs">DexScreener</ExtLink>
          <ExtLink href={solscanAcct(desk.mint)} className="rounded-full border border-white/10 px-3.5 py-2 text-xs">Solscan</ExtLink>
          {isOwner && (
            <Link to={`/dashboard/${desk.id}`} className="rounded-full bg-[#8AF5D0] px-4 py-2 text-xs font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="desk-dashboard-btn">
              Dashboard
            </Link>
          )}
        </div>
      </div>

      <Panel className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-white/5 overflow-hidden" data-testid="desk-stats">
        <Stat label="Price" value={<SubPrice value={m.priceSol} />} sub={m.priceSol ? fmtUsd(m.mcapUsd && m.priceSol ? null : null) : ""} testId="desk-price" />
        <Stat label="Market cap" value={fmtUsd(m.mcapUsd)} sub={m.mcapSol ? `${fmtNum(m.mcapSol, 1)} SOL` : ""} testId="desk-mcap" />
        <Stat label="Capital" value={fmtSol(t.capitalLamports, 2)} testId="desk-capital" />
        <Stat label="Deployed" value={fmtSol(t.deployedLamports, 2)} testId="desk-deployed" />
        <Stat label="Realized P&L" value={fmtSolSigned(t.realizedLamports, 3)} testId="desk-realized" />
        <Stat label="Unrealized" value={fmtSolSigned(t.unrealizedLamports, 3)} testId="desk-unrealized" />
        <Stat label="Claimed" value={fmtSol(t.claimedLamports, 2)} testId="desk-claimed" />
        <Stat label="Paid out" value={fmtSol(t.paidOutLamports, 2)} testId="desk-paidout" />
        <Stat label="Volume" value={fmtSol(t.volumeLamports, 1)} testId="desk-volume" />
        <Stat label="Trades 24h" value={fmtNum(t.trades24h)} testId="desk-trades" />
      </Panel>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2 overflow-hidden">
          <DeskChart deskId={desk.id} />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="p-5" data-testid="desk-wallets-panel">
            <div className="flex items-baseline justify-between">
              <span className="text-white font-medium">Wallets · {desk.wallets?.length ?? desk.walletCount}</span>
            </div>
            <p className="mt-1 text-[11px] font-light text-[#556b82]">All public. A maker's wallets never trade against each other.</p>
            <div className="mt-4 space-y-3">
              {(desk.wallets || []).map((w) => (
                <div key={w.address} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#8AF5D0]">
                      {w.role === "treasury" ? "Treasury" : `W${w.index}`}
                    </span>
                    <ExtLink href={solscanAcct(w.address)} className="font-mono text-[11px]">{short(w.address, 4, 4)}</ExtLink>
                    <span className="ml-auto font-mono text-xs text-white tnum">{fmtSol(w.solLamports, 3)}</span>
                  </div>
                  {w.role !== "treasury" && (
                    <div className="mt-1 font-mono text-[10px] text-[#556b82]">
                      {stratLine(w.triggers)} {w.lines?.entry ? `· entry ${Number(w.lines.entry).toPrecision(3)}` : "· Flat"} · Realized {fmtSol(w.realizedLamports, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5" data-testid="desk-settings-panel">
            <div className="flex items-baseline justify-between">
              <span className="text-white font-medium">Settings</span>
              <span className="font-mono text-[10px] text-[#556b82]">v{desk.settingsVersion ?? 1} · {desk.preset || "custom"}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono text-[11px]">
              {Object.entries(desk.settings || desk.strategy || {}).filter(([, v]) => v !== null && typeof v !== "object").slice(0, 12).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[#556b82]">{k.replace(/([A-Z])/g, " $1").replace(/Pct|Sol|Seconds|Bps/g, (m) => ` ${m.toLowerCase()}`)}</span>
                  <span className="text-white tnum">{typeof v === "boolean" ? (v ? "on" : "off") : String(v)}</span>
                </div>
              ))}
            </div>
          </Panel>

          {isOwner && (
            <Panel className="p-5 border-[#8AF5D0]/20" data-testid="desk-owner-panel">
              <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#8AF5D0]">You own this maker</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {desk.status === "running" ? (
                  <button data-testid="desk-pause-btn" disabled={!!acting} onClick={() => act("Pause", () => makers.pause(desk.id))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-4 text-xs text-white hover:border-[#ff4d4f]/50 hover:text-[#ff4d4f] disabled:opacity-50">
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button data-testid="desk-resume-btn" disabled={!!acting} onClick={() => act("Resume", () => makers.resume(desk.id))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#8AF5D0]/30 px-4 text-xs text-[#8AF5D0] hover:bg-[#8AF5D0]/10 disabled:opacity-50">
                    <Play size={12} /> Resume
                  </button>
                )}
                <button data-testid="desk-withdraw-btn" disabled={!!acting} onClick={() => act("Withdraw", () => makers.withdraw(desk.id, "profits"))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-4 text-xs text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] disabled:opacity-50">
                  <CircleDollarSign size={12} /> Withdraw profits
                </button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Panel className="mt-6 overflow-hidden" data-testid="desk-trades-panel">
        <div className="border-b border-white/5 px-4 py-3 text-white font-medium">Trades</div>
        {!trades && <Loading label="Loading trades" />}
        {trades && trades.length === 0 && <Empty>No trades yet. The maker records its finalized trades here.</Empty>}
        {trades && trades.length > 0 && (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="dtable" data-testid="desk-trades-table">
              <thead><tr><th>Side</th><th>Wallet</th><th className="text-right">SOL</th><th className="text-right">Price</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr></thead>
              <tbody>
                {trades.map((tr, i) => (
                  <tr key={tr.signature || i}>
                    <td><KindPill kind={tr.side || tr.kind} /></td>
                    <td className="font-mono text-[11px] text-[#8ca3b8]">{short(tr.wallet || "", 4, 4)}</td>
                    <td className="text-right font-mono text-white tnum">{lamportsToSol(tr.lamports ?? tr.solLamports)?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "—"}</td>
                    <td className="text-right font-mono text-[#8ca3b8] tnum">{tr.priceSol ? <SubPrice value={tr.priceSol} /> : "—"}</td>
                    <td className="text-right">{tr.signature ? <ExtLink href={solscanTx(tr.signature)} className="font-mono text-[10px]">{short(tr.signature, 4, 4)}</ExtLink> : "—"}</td>
                    <td className="text-right font-mono text-[11px] text-[#556b82]">{fmtAge(tr.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
