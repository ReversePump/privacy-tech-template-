import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, Check, Pause, Play, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { makers, errorMessage } from "../lib/api";
import { fmtSol, fmtSolSigned, fmtUsd, fmtNum, fmtAge, fmtPct, short, lamportsToSol, solscanAcct, solscanTx, pumpCoin, dexscreener } from "../lib/format";
import { Panel, Stat, CoinAvatar, StatusDot, TypeBadge, SubPrice, Loading, ExtLink, Empty, KindPill } from "../components/bits";
import { useAuth } from "../solana/AuthContext";
import { vaultBalance, vaultWithdraw, isMobileDevice } from "../lib/vault";
import DeskChart from "../components/DeskChart";
import { SettingsSummary } from "../components/SettingsEditor";

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
  const { publicKey, signMessage } = useWallet();
  const { signedIn, signIn } = useAuth();
  const [acting, setActing] = useState("");
  const [tab, setTab] = useState("trades");
  const isMobile = isMobileDevice();
  const [vaultBal, setVaultBal] = useState(null);
  const [vaultBusy, setVaultBusy] = useState(false);

  const refreshVault = (mint) => {
    if (!publicKey || !mint) return;
    vaultBalance(publicKey.toBase58(), mint).then((b) => setVaultBal(b.balanceSol ?? 0)).catch(() => {});
  };

  const load = () =>
    makers.desk(id).then(setDesk).catch((e) => setErr(errorMessage(e)));

  useEffect(() => {
    setDesk(null); setErr(null);
    load();
    makers.trades(id).then((d) => setTrades(d.trades || [])).catch(() => setTrades([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (isMobile && publicKey && desk?.mint) refreshVault(desk.mint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, publicKey?.toBase58?.(), desk?.mint]);

  const withdrawFromVault = async () => {
    if (!publicKey || !desk?.mint) return;
    setVaultBusy(true);
    try {
      const res = await vaultWithdraw({ mint: desk.mint, publicKey, signMessage });
      toast.success("Withdrawal sent", { description: res.signature ? `Signature ${short(res.signature)}` : undefined });
      refreshVault(desk.mint);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setVaultBusy(false); }
  };

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
      <div className="font-mono text-[11px] uppercase tracking-wider text-[#93a184]">
        <Link to="/explore" className="hover:text-[#3F9E00]">Explore</Link> / ${desk.ticker}
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        <CoinAvatar url={desk.imageUrl} name={desk.name} size={56} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-[#131a0f]">
            {desk.name} <span className="text-lg text-[#93a184] font-light">${desk.ticker}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs text-[#5c6b50]">
            <StatusDot status={desk.status} />
            <TypeBadge desk={desk} />
            <span>{desk.preset || "custom"} · {desk.walletCount} wallets</span>
            {m.venue && <span>{m.venue === "pool" ? "liquidity pool" : "bonding curve"}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[#93a184]">
            <button onClick={() => copy(desk.mint, "mint")} className="inline-flex items-center gap-1 hover:text-[#3F9E00]" data-testid="desk-copy-mint">
              {copied === "mint" ? <Check size={10} /> : <Copy size={10} />} Mint {short(desk.mint, 4, 4)}
            </button>
            <button onClick={() => copy(desk.owner, "owner")} className="inline-flex items-center gap-1 hover:text-[#3F9E00]" data-testid="desk-copy-owner">
              {copied === "owner" ? <Check size={10} /> : <Copy size={10} />} Owner {short(desk.owner, 4, 4)}
            </button>
            <span>Launched {fmtAge(desk.launchedAt || desk.createdAt)} ago</span>
            {desk.links?.website && <ExtLink href={desk.links.website}>Website</ExtLink>}
            {desk.links?.x && <ExtLink href={desk.links.x}>X</ExtLink>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExtLink href={pumpCoin(desk.mint)} className="rounded-[3px] border border-black/10 px-3.5 py-2 text-xs">Market</ExtLink>
          <ExtLink href={dexscreener(desk.mint)} className="rounded-[3px] border border-black/10 px-3.5 py-2 text-xs">Chart</ExtLink>
          <ExtLink href={solscanAcct(desk.mint)} className="rounded-[3px] border border-black/10 px-3.5 py-2 text-xs">Explorer</ExtLink>
          {isOwner && (
            <Link to={`/dashboard/${desk.id}`} className="rounded-[3px] bg-[#3F9E00] px-4 py-2 text-xs font-medium text-[#131a0f] hover:bg-[#54C400]" data-testid="desk-dashboard-btn">
              Dashboard
            </Link>
          )}
        </div>
      </div>

      <Panel className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-black/5 overflow-hidden" data-testid="desk-stats">
        <Stat label="Price" value={<SubPrice value={m.priceSol} />} sub={m.priceSol ? fmtUsd(m.mcapUsd && m.priceSol ? null : null) : ""} testId="desk-price" />
        <Stat label="Market cap" value={fmtUsd(m.mcapUsd)} sub={m.mcapSol ? `${fmtNum(m.mcapSol, 1)} SOL` : ""} testId="desk-mcap" />
        <Stat label="Capital" value={fmtSol(t.capitalLamports, 2)} testId="desk-capital" />
        <Stat label="Deployed" value={fmtSol(t.deployedLamports, 2)} testId="desk-deployed" />
        <Stat label="Realized P&L" value={fmtSolSigned(t.realizedLamports, 3)} testId="desk-realized" />
        <Stat label="Unrealized" value={fmtSolSigned(t.unrealizedLamports, 3)} testId="desk-unrealized" />
        <Stat label="Claimed" value={fmtSol(t.claimedLamports, 2)} testId="desk-claimed" />
        <Stat label="Paid out" value={fmtSol(t.paidOutLamports, 2)} testId="desk-paidout" />
        <Stat label="Payable to owner" value={fmtSol(desk.treasury?.payableLamports, 3)} testId="desk-payable" />
        <Stat label="Reserve" value={fmtSol(desk.treasury?.reserveLamports, 3)} testId="desk-reserve" />
        <Stat label="Volume" value={fmtSol(t.volumeLamports, 1)} testId="desk-volume" />
        <Stat label="Trades 24h" value={fmtNum(t.trades24h)} testId="desk-trades" />
      </Panel>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <DeskChart deskId={desk.id} />
          </Panel>

          {(() => {
            const mmw = (desk.wallets || []).filter((w) => w.role !== "treasury");
            const asks = mmw.filter((w) => w.lines?.sellAbove).map((w) => ({ w, px: Number(w.lines.sellAbove) })).sort((a, b) => b.px - a.px);
            const bids = mmw.filter((w) => w.lines?.buyBelow).map((w) => ({ w, px: Number(w.lines.buyBelow) })).sort((a, b) => b.px - a.px);
            if (!asks.length && !bids.length) return null;
            const Row = ({ px, w, side }) => (
              <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2 last:border-0 font-mono text-[11px]">
                <span className={`tnum ${side === "ask" ? "text-[#d43d3d]" : "text-[#3F9E00]"}`}><SubPrice value={px} /></span>
                <span className="text-[#5c6b50]">W{w.index}</span>
                <span className="ml-auto truncate text-[#93a184] max-w-[55%]">{w.status?.text || (side === "ask" ? "take profit" : "dip buy")}</span>
              </div>
            );
            return (
              <Panel className="overflow-hidden" data-testid="desk-book-panel">
                <div className="border-b border-black/5 px-4 py-3 flex items-baseline justify-between">
                  <span className="text-[#131a0f] font-medium">Order book</span>
                  <span className="font-mono text-[10px] text-[#93a184]">where the maker trades next</span>
                </div>
                {asks.length > 0 && (
                  <>
                    <div className="px-4 pt-2 font-mono text-[9px] uppercase tracking-wider text-[#d43d3d]">Asks · take profits</div>
                    {asks.map((r) => <Row key={`a${r.w.address}`} px={r.px} w={r.w} side="ask" />)}
                  </>
                )}
                <div className="px-4 py-2 font-mono text-[10px] text-[#131a0f] border-y border-black/5 bg-black/[0.02]">
                  price now <SubPrice value={m.priceSol} />
                </div>
                {bids.length > 0 && (
                  <>
                    <div className="px-4 pt-2 font-mono text-[9px] uppercase tracking-wider text-[#3F9E00]">Bids · next buys</div>
                    {bids.map((r) => <Row key={`b${r.w.address}`} px={r.px} w={r.w} side="bid" />)}
                  </>
                )}
              </Panel>
            );
          })()}
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="p-5" data-testid="desk-wallets-panel">
            <div className="flex items-baseline justify-between">
              <span className="text-[#131a0f] font-medium">Wallets · {desk.wallets?.length ?? desk.walletCount}</span>
            </div>
            <p className="mt-1 text-[11px] font-light text-[#93a184]">All public — and a maker's wallets never fill each other.</p>
            <div className="mt-4 space-y-3">
              {(desk.wallets || []).map((w) => (
                <div key={w.address} className="rounded-lg border border-black/5 bg-black/[0.03] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#3F9E00]">
                      {w.role === "treasury" ? "Treasury" : `W${w.index}`}
                    </span>
                    <ExtLink href={solscanAcct(w.address)} className="font-mono text-[11px]">{short(w.address, 4, 4)}</ExtLink>
                    <span className="ml-auto font-mono text-xs text-[#131a0f] tnum">{fmtSol(w.solLamports, 3)}</span>
                  </div>
                  {w.role !== "treasury" && (
                    <div className="mt-1 font-mono text-[10px] text-[#93a184]">
                      {stratLine(w.triggers)} {w.lines?.entry ? `· entry ${Number(w.lines.entry).toPrecision(3)}` : "· Flat"} · Realized {fmtSol(w.realizedLamports, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5" data-testid="desk-settings-panel">
            <div className="flex items-baseline justify-between">
              <span className="text-[#131a0f] font-medium">Maker controls</span>
              <span className="font-mono text-[10px] text-[#93a184]">v{desk.settingsVersion ?? 1} · {desk.preset || "custom"}</span>
            </div>
            <div className="mt-4">
              <SettingsSummary settings={desk.settings || desk.strategy} />
            </div>
          </Panel>

          {isMobile && publicKey && (
            <Panel className="p-5" data-testid="desk-vault-panel">
              <div className="flex items-baseline justify-between">
                <span className="text-[#131a0f] font-medium">Your vault</span>
                <span className="font-mono text-sm text-[#131a0f] tnum" data-testid="desk-vault-balance">
                  {vaultBal === null ? "—" : `${vaultBal.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`}
                </span>
              </div>
              {vaultBal > 0 && (
                <button onClick={withdrawFromVault} disabled={vaultBusy} data-testid="desk-withdraw-btn"
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-[#3F9E00]/40 px-4 text-xs text-[#3F9E00] hover:bg-[#3F9E00]/5 disabled:opacity-50">
                  <CircleDollarSign size={12} /> {vaultBusy ? "Approve in your wallet…" : "Withdraw SOL"}
                </button>
              )}
              <p className="mt-3 text-[10px] font-light text-[#93a184]">Fund it from the Onboard page. Withdrawals land back in this wallet.</p>
            </Panel>
          )}

          {isOwner && !isMobile && (
            <Panel className="p-5 border-[#3F9E00]/20" data-testid="desk-owner-panel">
              <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#3F9E00]">You own this maker</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {desk.status === "running" ? (
                  <button data-testid="desk-pause-btn" disabled={!!acting} onClick={() => act("Pause", () => makers.pause(desk.id))}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#d43d3d]/50 hover:text-[#d43d3d] disabled:opacity-50">
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button data-testid="desk-resume-btn" disabled={!!acting} onClick={() => act("Resume", () => makers.resume(desk.id))}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-[#3F9E00]/30 px-3 text-xs text-[#3F9E00] hover:bg-[#3F9E00]/10 disabled:opacity-50">
                    <Play size={12} /> Resume
                  </button>
                )}
                <button data-testid="desk-withdraw-profits-btn" disabled={!!acting} onClick={() => act("Withdraw profits", () => makers.withdraw(desk.id, "profits"))}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] disabled:opacity-50">
                  <CircleDollarSign size={12} /> Profits out
                </button>
                <button data-testid="desk-withdraw-capital-btn" disabled={!!acting}
                  onClick={() => { const sol = window.prompt("Capital to withdraw (SOL) — leave empty for all:"); act("Withdraw capital", () => makers.withdraw(desk.id, "capital", sol ? { sol: Number(sol) } : undefined)); }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] disabled:opacity-50">
                  <CircleDollarSign size={12} /> Capital out
                </button>
                <button data-testid="desk-withdraw-tokens-btn" disabled={!!acting}
                  onClick={() => window.confirm("Withdraw the maker's token holdings to your wallet?") && act("Withdraw tokens", () => makers.withdraw(desk.id, "tokens"))}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] disabled:opacity-50">
                  <CircleDollarSign size={12} /> Tokens out
                </button>
                <button data-testid="desk-liquidate-btn" disabled={!!acting}
                  onClick={() => window.confirm("Sell the entire position at market? This realizes any loss.") && act("Liquidate", () => makers.liquidate(desk.id))}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#d43d3d]/50 hover:text-[#d43d3d] disabled:opacity-50">
                  Liquidate
                </button>
                <button data-testid="desk-close-btn" disabled={!!acting}
                  onClick={() => window.confirm("Close this maker for good? Position is sold and remaining SOL returns to you.") && act("Close", () => makers.closeDesk(desk.id))}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-black/15 px-3 text-xs text-[#131a0f] hover:border-[#d43d3d]/50 hover:text-[#d43d3d] disabled:opacity-50">
                  Close maker
                </button>
              </div>
              <p className="mt-3 text-[10px] font-light text-[#93a184]">Withdrawals, liquidations and closes are on-chain actions — irreversible.</p>
            </Panel>
          )}
        </div>
      </div>

      {(() => {
        const claims = desk.claims || [];
        const transfers = desk.transfers || [];
        const changes = desk.changes || [];
        const requests = desk.requests || [];
        const counts = { trades: (trades || desk.trades || []).length, claims: claims.length, transfers: transfers.length, settings: changes.length + requests.length };
        const TABS = [["trades", "Trades"], ["claims", "Claims"], ["transfers", "Transfers"], ["settings", "Settings log"]];
        return (
          <Panel className="mt-6 overflow-hidden" data-testid="desk-activity-panel">
            <div className="flex items-center gap-1 border-b border-black/5 px-3 py-2">
              {TABS.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} data-testid={`desk-tab-${key}`}
                  className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${tab === key ? "bg-[#3F9E00] text-white" : "text-[#5c6b50] hover:text-[#131a0f]"}`}>
                  {label}{counts[key] ? ` ${counts[key]}` : ""}
                </button>
              ))}
            </div>

            {tab === "trades" && (
              <>
                {!trades && <Loading label="Loading trades" />}
                {trades && trades.length === 0 && <Empty>No trades yet. The maker records its finalized trades here.</Empty>}
                {trades && trades.length > 0 && (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="dtable" data-testid="desk-trades-table">
                      <thead><tr><th>Side</th><th>Wallet</th><th className="text-right">SOL</th><th className="text-right">Price</th><th>Why</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr></thead>
                      <tbody>
                        {trades.map((tr, i) => (
                          <tr key={tr.signature || i}>
                            <td><KindPill kind={tr.side || tr.kind} /></td>
                            <td className="font-mono text-[11px] text-[#5c6b50]">{tr.walletIndex != null ? `W${tr.walletIndex}` : short(tr.wallet || "", 4, 4)}</td>
                            <td className="text-right font-mono text-[#131a0f] tnum">{lamportsToSol(tr.lamports ?? tr.solLamports)?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "—"}</td>
                            <td className="text-right font-mono text-[#5c6b50] tnum">{tr.price ? <SubPrice value={tr.price} /> : tr.priceSol ? <SubPrice value={tr.priceSol} /> : "—"}</td>
                            <td className="font-mono text-[10px] text-[#93a184] max-w-[220px] truncate" title={tr.reason}>{tr.trigger ? `${tr.trigger} — ` : ""}{tr.reason || "—"}</td>
                            <td className="text-right">{tr.signature ? <ExtLink href={solscanTx(tr.signature)} className="font-mono text-[10px]">{short(tr.signature, 4, 4)}</ExtLink> : "—"}</td>
                            <td className="text-right font-mono text-[11px] text-[#93a184]">{fmtAge(tr.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "claims" && (
              claims.length === 0 ? <Empty>No reward claims yet.</Empty> : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="dtable" data-testid="desk-claims-table">
                    <thead><tr><th className="text-right">Claimed</th><th className="text-right">To treasury</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr></thead>
                    <tbody>
                      {claims.map((c, i) => (
                        <tr key={c.id || c.signature || i}>
                          <td className="text-right font-mono text-[#131a0f] tnum">{fmtSol(c.lamports, 4)}</td>
                          <td className="text-right font-mono text-[#5c6b50] tnum">{fmtSol(c.treasuryLamports, 4)}</td>
                          <td className="text-right">{c.signature ? <ExtLink href={solscanTx(c.signature)} className="font-mono text-[10px]">{short(c.signature, 4, 4)}</ExtLink> : "—"}</td>
                          <td className="text-right font-mono text-[11px] text-[#93a184]">{fmtAge(c.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "transfers" && (
              transfers.length === 0 ? <Empty>No transfers yet.</Empty> : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="dtable" data-testid="desk-transfers-table">
                    <thead><tr><th>Kind</th><th>From</th><th>To</th><th className="text-right">SOL</th><th className="text-right">Transaction</th><th className="text-right">Age</th></tr></thead>
                    <tbody>
                      {transfers.map((tr, i) => (
                        <tr key={tr.id || tr.signature || i}>
                          <td><KindPill kind={tr.kind} /></td>
                          <td className="font-mono text-[11px] text-[#5c6b50]">{short(tr.from || "", 4, 4)}</td>
                          <td className="font-mono text-[11px] text-[#5c6b50]">{short(tr.to || "", 4, 4)}</td>
                          <td className="text-right font-mono text-[#131a0f] tnum">{fmtSol(tr.lamports, 4)}</td>
                          <td className="text-right">{tr.signature ? <ExtLink href={solscanTx(tr.signature)} className="font-mono text-[10px]">{short(tr.signature, 4, 4)}</ExtLink> : "—"}</td>
                          <td className="text-right font-mono text-[11px] text-[#93a184]">{fmtAge(tr.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "settings" && (
              (changes.length === 0 && requests.length === 0) ? <Empty>No settings changes yet.</Empty> : (
                <div className="max-h-[420px] overflow-y-auto" data-testid="desk-settings-log">
                  {requests.map((r, i) => (
                    <div key={`req-${r.id || i}`} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
                      <span className="rounded-[3px] bg-[#a8780f]/10 px-2 py-0.5 font-mono text-[9px] uppercase text-[#a8780f]">pending</span>
                      <span className="font-mono text-xs text-[#3a4a33]">{r.summary || r.kind || JSON.stringify(r.change || r).slice(0, 90)}</span>
                      <span className="ml-auto font-mono text-[11px] text-[#93a184]">{fmtAge(r.at || r.createdAt)}</span>
                    </div>
                  ))}
                  {changes.map((c, i) => (
                    <div key={`chg-${i}`} className="border-b border-black/5 px-4 py-2.5 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="rounded-[3px] bg-[#3F9E00]/10 px-2 py-0.5 font-mono text-[9px] uppercase text-[#3F9E00]">v{c.version ?? "—"}</span>
                        <span className="font-mono text-[11px] text-[#5c6b50]">by {short(c.by || "", 4, 4)}</span>
                        <span className="ml-auto font-mono text-[11px] text-[#93a184]">{fmtAge(c.at || c.createdAt)}</span>
                      </div>
                      {(c.changes || c.summary) && (
                        <div className="mt-1.5 font-mono text-[11px] text-[#3a4a33]">
                          {c.summary || (c.changes || []).map((ch) => `${ch.field}: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`).join(" · ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </Panel>
        );
      })()}
    </div>
  );
}
