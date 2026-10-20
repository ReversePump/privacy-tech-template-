import React, { useEffect, useState } from "react";
import Seo from "../components/Seo";
import { Link } from "react-router-dom";
import { Wallet, LogOut, Play, Loader2, Copy, Check, ArrowDownUp, ArrowUpRight, CircleX, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { loom, errorMessage } from "../lib/api";
import { fmtUsd, fmtPctSigned, fmtAge, short } from "../lib/format";
import { Panel, Tag, Loading, Empty, Sparkline } from "../components/bits";
import { useAuth } from "../solana/AuthContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import AuthModal from "../components/AuthModal";

const API = process.env.REACT_APP_BACKEND_URL;
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const authed = (token, path, body, method) =>
  fetch(`${API}/api${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : `failed (${r.status})`);
    return d;
  });

export default function Account() {
  const { signedIn, signOut, token, wallet, user } = useAuth();
  const { signTransaction } = useWallet();
  const [authOpen, setAuthOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [btMap, setBtMap] = useState({});
  const [btBusy, setBtBusy] = useState("");
  const [solInfo, setSolInfo] = useState(null);
  const [hlInfo, setHlInfo] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [deployments, setDeployments] = useState(null);
  const [paper, setPaper] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [history, setHistory] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [copied, setCopied] = useState("");

  const isEmail = user?.authType === "email";

  const copy = (v, k) => {
    navigator.clipboard?.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(""), 1500);
  };

  const refresh = () => {
    if (!signedIn) return;
    authed(token, "/wallet").then(setSolInfo).catch(() => {});
    if (isEmail) authed(token, "/hl/account").then(setHlInfo).catch(() => setHlInfo(null));
    authed(token, "/deployments").then((d) => setDeployments(d.deployments || [])).catch(() => {});
    authed(token, "/paper/account").then(setPaper).catch(() => {});
    authed(token, "/alerts/me").then(setAlerts).catch(() => {});
    authed(token, "/history").then((d) => setHistory(d.items || [])).catch(() => {});
    authed(token, "/wallet/holdings").then((d) => setHoldings(d.holdings || [])).catch(() => {});
  };

  useEffect(() => {
    if (!signedIn) return;
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, token, isEmail]);

  useEffect(() => {
    authedPublic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, token]);

  const authedPublic = () => {
    if (!signedIn) return;
    fetch(`${API}/api/me/strategies`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSaved(d.strategies || []))
      .catch(() => setSaved([]));
    refresh();
    fetch(`${API}/api/hl/markets`).then((r) => r.json()).then((d) => setMarkets(d.markets || [])).catch(() => {});
  };

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-20 text-center" data-testid="account-page">
        <Seo title="Your account · Loom" description="Your generated wallets, live trading on Solana and Hyperliquid, deployments, practice account, alerts and history." path="/account" />
        <Wallet size={28} className="mx-auto text-[#9aa0ae]" />
        <h1 className="mt-4 serif text-3xl font-light">Your account</h1>
        <p className="mt-2 text-[13px] text-[#9aa0ae]">Email and password — we generate your wallets. Or connect your own.</p>
        <button onClick={() => setAuthOpen(true)} data-testid="account-signin-btn"
          className="mt-6 h-11 rounded-full bg-[#e5e7eb] px-6 text-sm font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] transition-colors">
          Sign in
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="account-page">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="serif text-4xl font-light tracking-tight">Your account</h1>
          <p className="mt-1 mono text-[12px] text-[#9aa0ae]" data-testid="account-wallet">{user?.email || short(wallet, 6, 6)}</p>
        </div>
        <button onClick={signOut} data-testid="account-signout-btn"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffffff26] px-4 text-[12px] text-[#9aa0ae] hover:text-[#f4f4f5]">
          <LogOut size={12} /> Sign out
        </button>
      </div>

      <Panel className="mt-8 grid grid-cols-1 md:grid-cols-3 divide-x divide-[#ffffff26] overflow-hidden" data-testid="account-stats">
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">Solana balance</div>
          <div className="mt-1 text-xl font-medium tnum" data-testid="acct-sol-bal">{solInfo ? `${solInfo.sol.toFixed(4)} SOL` : "—"}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">Hyperliquid equity</div>
          <div className="mt-1 text-xl font-medium tnum" data-testid="acct-hl-eq">{hlInfo ? fmtUsd(hlInfo.equityUsd) : isEmail ? "—" : "n/a"}</div>
          <div className="mt-0.5 text-[11px] text-[#9aa0ae]">{hlInfo ? `${hlInfo.positions.length} open` : ""}</div>
          {hlInfo?.equityHistory?.length > 1 && (
            <div className="mt-2 -mx-1" data-testid="hl-equity-chart">
              <Sparkline points={hlInfo.equityHistory} height={34} />
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#9aa0ae]">Saved strategies</div>
          <div className="mt-1 text-xl font-medium tnum">{saved ? saved.length : "—"}</div>
        </div>
      </Panel>

      {isEmail && (
        <>
          {/* WALLETS / DEPOSITS */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="wallets-panel">
            <DepositCard
              title="Solana wallet · generated for you"
              address={solInfo?.address || wallet}
              hint="Deposit SOL or USDC (Solana network) — then swap any Solana token below, for real."
              copyKey="sol" copied={copied} copy={copy} testid="sol-address"
            />
            <DepositCard
              title="Hyperliquid account · generated for you"
              address={hlInfo?.address || ""}
              hint="Fund with USDC on Arbitrum to this address, or USDC from any Hyperliquid account — then trade perps and spot below, for real."
              copyKey="hl" copied={copied} copy={copy} testid="hl-address"
            />
          </div>

          <HoldingsPanel holdings={holdings} solInfo={solInfo} />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SolTradePanel token={token} onDone={refresh} />
            <HlTradePanel token={token} markets={markets} hlInfo={hlInfo} onDone={refresh} />
          </div>

          <WithdrawPanel token={token} hlInfo={hlInfo} onDone={refresh} />
        </>
      )}

      {!isEmail && signedIn && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="wallet-trade-row">
          <SolTradePanel token={token} onDone={refresh} selfSign signTransaction={signTransaction} />
          <Panel className="p-5">
            <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Your own wallet</div>
            <p className="mt-2 text-[13px] text-[#9aa0ae] leading-relaxed">
              You connected your own wallet — swaps are built here and signed by you in your wallet app; Loom never touches your keys.
              For Hyperliquid perps, limit orders, withdrawals and the 24/7 engine with real execution, sign in with email and a wallet is generated for you.
            </p>
            <p className="mt-3 mono text-[11px] text-[#6b7280]">Connected: {short(wallet, 6, 6)}</p>
          </Panel>
        </div>
      )}

      <DeploymentsPanel token={token} deployments={deployments} onDone={refresh} />
      <PaperPanel paper={paper} token={token} onDone={refresh} />
      <AlertsPanel token={token} alerts={alerts} onDone={refresh} />
      <HistoryPanel history={history} />

      <h2 className="mt-10 serif text-2xl font-light">My strategies</h2>
      <div className="mt-4 space-y-4" data-testid="account-strategies">
        {!saved && <Loading label="Loading your strategies" />}
        {saved && saved.length === 0 && (
          <Empty>Nothing saved yet. <Link to="/new" className="text-[#f1f5f9]">Draft a strategy →</Link></Empty>
        )}
        {saved?.map((doc) => {
          const bt = btMap[doc.strategyId];
          const equity = (bt?.equityCurve || []).map((p) => ({ t: p.t ?? p[0], v: p.equityUsd ?? p.v ?? p[1] }));
          return (
            <Panel key={doc.strategyId} className="p-5" data-testid={`saved-${doc.strategyId}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{doc.name}</div>
                  <div className="mono text-[10px] text-[#9aa0ae]">{doc.strategyId} · saved {fmtAge(doc.savedAt)}</div>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={async () => {
                    if (btBusy) return;
                    setBtBusy(doc.strategyId);
                    try { setBtMap((m) => ({ ...m, [doc.strategyId]: null })); const d = await loom.backtest({ strategy: doc.strategy }); setBtMap((m) => ({ ...m, [doc.strategyId]: d })); }
                    catch (e) { toast.error(errorMessage(e)); }
                    finally { setBtBusy(""); }
                  }} disabled={btBusy === doc.strategyId} data-testid={`saved-bt-${doc.strategyId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffffff26] px-4 text-[12px] hover:border-[#f1f5f9] hover:text-[#cbd5e1] disabled:opacity-40 transition-colors">
                    {btBusy === doc.strategyId ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Backtest
                  </button>
                  <Link to={`/new?thesis=${encodeURIComponent(doc.thesis || doc.name)}`}
                    className="inline-flex h-9 items-center rounded-full bg-[#e5e7eb] px-4 text-[12px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] transition-colors">
                    Open
                  </Link>
                </div>
              </div>
              {doc.thesis && <p className="mt-3 serif italic text-[14px]">“{doc.thesis}”</p>}
              {bt && (
                <div className="mt-4 fadeup">
                  <Sparkline points={equity} height={100} />
                  <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
                    <span>Return <b className={bt.stats?.returnPct < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}>{fmtPctSigned(bt.stats?.returnPct)}</b></span>
                    <span>Trades <b>{bt.stats?.trades ?? "—"}</b></span>
                    <span>End equity <b>{fmtUsd(bt.stats?.endEquityUsd)}</b></span>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function HoldingsPanel({ holdings, solInfo }) {
  if (!holdings) return null;
  return (
    <Panel className="mt-4 p-5" data-testid="holdings-panel">
      <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Token holdings · Solana wallet</div>
      {holdings.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-[#9aa0ae]" data-testid="holdings-empty">
          No tokens yet{solInfo && solInfo.sol === 0 ? " — deposit SOL and swap into any token above" : ""}.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {holdings.map((h) => (
            <div key={h.mint} className="flex flex-wrap items-center gap-3 text-[12.5px]" data-testid={`holding-${(h.symbol || h.mint).slice(0, 8)}`}>
              <span className="font-medium">{h.symbol || short(h.mint, 4, 4)}</span>
              <span className="mono tnum text-[#9aa0ae]">{h.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
              {h.valueUsd != null && <span className="mono tnum">{fmtUsd(h.valueUsd)}</span>}
              <a href={`https://solscan.io/token/${h.mint}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto mono text-[10px] text-[#f1f5f9] hover:underline">view ↗</a>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DepositCard({ title, address, hint, copyKey, copied, copy, testid }) {
  const [qr, setQr] = useState(null);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    if (address) QRCode.toDataURL(address, { margin: 1, width: 220, color: { dark: "#f4f4f5", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [address]);
  return (
    <Panel className="p-5">
      <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">{title}</div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => copy(address, copyKey)} className="flex items-center gap-2 mono text-[12px] text-[#f4f4f5] hover:text-[#cbd5e1]" data-testid={testid}>
          {copied === copyKey ? <Check size={12} className="text-[#10b981]" /> : <Copy size={12} />}
          {short(address, 10, 10)}
        </button>
        <button onClick={() => setShowQr(!showQr)} data-testid={`${testid}-qr-toggle`}
          className="inline-flex items-center gap-1 rounded-full border border-[#ffffff26] px-2.5 py-1 text-[10.5px] text-[#9aa0ae] hover:text-[#f4f4f5] transition-colors">
          <QrCode size={11} /> {showQr ? "Hide" : "QR"}
        </button>
      </div>
      {showQr && qr && (
        <div className="mt-3 flex justify-center rounded-lg border border-[#ffffff26] bg-[#17171b] p-3 fadeup" data-testid={`${testid}-qr`}>
          <img src={qr} alt="deposit address QR" className="h-36 w-36" />
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-[#9aa0ae]">{hint}</p>
    </Panel>
  );
}

function HistoryPanel({ history }) {
  if (!history) return null;
  const tone = { swap: "accent", perp: "long", spot: "long", engine: "amber", withdraw: "neutral" };
  return (
    <div className="mt-10" data-testid="history-section">
      <h2 className="serif text-2xl font-light">History</h2>
      <div className="mt-4 space-y-2">
        {history.length === 0 && <Empty>Nothing yet — swaps, perp and spot orders, engine fills and withdrawals all land here.</Empty>}
        {history.map((h, i) => (
          <Panel key={i} className="p-4" data-testid={`history-${i}`}>
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <Tag tone={tone[h.type] || "neutral"}>{h.type}</Tag>
              <span className="font-medium">{h.title}</span>
              <span className="text-[#9aa0ae]">{h.detail}</span>
              {h.tx && (
                <a href={`https://solscan.io/tx/${h.tx}`} target="_blank" rel="noopener noreferrer"
                  className="mono text-[10px] text-[#f1f5f9] hover:underline">tx ↗</a>
              )}
              <span className="ml-auto mono text-[10px] text-[#9aa0ae]">{fmtAge(h.at)}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function DeploymentsPanel({ token, deployments, onDone }) {
  const [busy, setBusy] = useState("");
  const [instructFor, setInstructFor] = useState("");
  const [instructText, setInstructText] = useState("");
  const control = async (id, action) => {
    setBusy(id + action);
    try {
      await authed(token, `/deployments/${id}/control`, { action });
      toast.success(`Deployment ${{ pause: "paused", resume: "resumed", stop: "stopped" }[action] || action}`);
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const stopAll = async () => {
    setBusy("all");
    try {
      const d = await authed(token, "/account/stop-all", {});
      toast.success(`Stopped ${d.stopped} deployment${d.stopped === 1 ? "" : "s"}`);
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const del = async (id) => {
    setBusy(id + "delete");
    try {
      await authed(token, `/deployments/${id}`, null, "DELETE");
      toast.success("Deployment deleted");
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const instruct = async (id) => {
    const t = instructText.trim();
    if (!t) return;
    setBusy(id + "instruct");
    try {
      await authed(token, `/deployments/${id}/instruct`, { instruction: t });
      toast.success("Strategy updated — running with the new rules");
      setInstructFor(""); setInstructText("");
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const anyActive = deployments?.some((d) => d.status === "active" || d.status === "paused");
  return (
    <div className="mt-10" data-testid="deployments-section">
      <div className="flex items-center gap-3">
        <h2 className="serif text-2xl font-light">Deployments <span className="text-[13px] text-[#9aa0ae]">— the engine checks every ~25s</span></h2>
        {anyActive && (
          <button onClick={stopAll} disabled={!!busy} data-testid="stop-all-btn"
            className="rounded-full border border-[#f43f5e55] px-3 py-1 text-[11px] text-[#f43f5e] hover:border-[#f43f5e] disabled:opacity-40 transition-colors">
            {busy === "all" ? "Stopping…" : "Stop all"}
          </button>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {!deployments && <Loading label="Loading deployments" />}
        {deployments?.length === 0 && (
          <Empty>Nothing running. <Link to="/new" className="text-[#f1f5f9]">Draft a strategy</Link> and start it as practice, alerts or live.</Empty>
        )}
        {deployments?.map((d) => (
          <Panel key={d.id} className="p-5" data-testid={`deployment-${d.id}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Tag tone={d.mode === "live" ? "long" : d.mode === "paper" ? "accent" : "amber"}>{d.mode}</Tag>
              <div className="min-w-0">
                <div className="text-[14px] font-medium truncate">{d.strategyName || d.kind}</div>
                <div className="mono text-[10px] text-[#9aa0ae]">{d.kind}{d.targetAddress ? ` · ${short(d.targetAddress, 6, 4)}` : ""} · {d.status}</div>
              </div>
              <div className="ml-auto flex gap-2">
                {d.status === "active" && (
                  <button onClick={() => control(d.id, "pause")} disabled={!!busy} data-testid={`dep-pause-${d.id}`}
                    className="h-8 rounded-full border border-[#ffffff26] px-3.5 text-[11.5px] text-[#9aa0ae] hover:text-[#f4f4f5]">Pause</button>
                )}
                {d.status === "paused" && (
                  <button onClick={() => control(d.id, "resume")} disabled={!!busy} data-testid={`dep-resume-${d.id}`}
                    className="h-8 rounded-full border border-[#ffffff26] px-3.5 text-[11.5px] text-[#10b981] hover:border-[#10b981]">Resume</button>
                )}
                {(d.status === "active" || d.status === "paused") && (
                  <button onClick={() => control(d.id, "stop")} disabled={!!busy} data-testid={`dep-stop-${d.id}`}
                    className="h-8 rounded-full border border-[#ffffff26] px-3.5 text-[11.5px] text-[#f43f5e] hover:border-[#f43f5e]">Stop</button>
                )}
                {d.status === "stopped" && (
                  <button onClick={() => del(d.id)} disabled={!!busy} data-testid={`dep-delete-${d.id}`}
                    className="h-8 rounded-full border border-[#ffffff26] px-3.5 text-[11.5px] text-[#9aa0ae] hover:text-[#f43f5e] hover:border-[#f43f5e66]">Delete</button>
                )}
                {d.kind === "strategy" && d.status !== "stopped" && (
                  <button onClick={() => { setInstructFor(instructFor === d.id ? "" : d.id); setInstructText(""); }} disabled={!!busy} data-testid={`dep-instruct-${d.id}`}
                    className="h-8 rounded-full border border-[#ffffff26] px-3.5 text-[11.5px] text-[#9aa0ae] hover:text-[#f4f4f5]">Edit with AI</button>
                )}
              </div>
            </div>
            {instructFor === d.id && (
              <div className="mt-3 flex gap-2 border-t border-[#ffffff26] pt-3" data-testid={`dep-instruct-form-${d.id}`}>
                <input
                  value={instructText}
                  onChange={(e) => setInstructText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && instruct(d.id)}
                  placeholder="e.g. lower the stop to 10% and use $100 instead"
                  data-testid={`dep-instruct-input-${d.id}`}
                  className="h-9 flex-1 rounded-full border border-[#ffffff26] bg-transparent px-4 text-[12.5px] text-[#f4f4f5] placeholder-[#6b7280] outline-none focus:border-[#ffffff59]"
                />
                <button onClick={() => instruct(d.id)} disabled={!!busy || !instructText.trim()} data-testid={`dep-instruct-apply-${d.id}`}
                  className="h-9 rounded-full bg-[#e5e7eb] px-4 text-[12px] font-medium text-black hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors">
                  {busy === d.id + "instruct" ? "Applying…" : "Apply"}
                </button>
              </div>
            )}
            {d.events?.length > 0 && (
              <div className="mt-3 border-t border-[#ffffff26] pt-3 space-y-1" data-testid={`dep-events-${d.id}`}>
                {[...d.events].slice(-3).reverse().map((e, i) => (
                  <div key={i} className="flex gap-2 text-[11.5px]">
                    <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.kind === "fill" ? "bg-[#10b981]" : e.kind === "error" ? "bg-[#f43f5e]" : e.kind === "alert" ? "bg-[#f1f5f9]" : "bg-[#6b7280]"}`} />
                    <span className="text-[#f4f4f5]">{e.msg}</span>
                    <span className="ml-auto mono text-[10px] text-[#9aa0ae]">{fmtAge(e.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}

function PaperPanel({ paper, token, onDone }) {
  const [resetBusy, setResetBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState("");
  if (!paper) return null;
  const pnl = paper.equityUsd - paper.startUsd;
  const reset = async () => {
    setResetBusy(true);
    try {
      await authed(token, "/paper/reset", {});
      toast.success("Practice account reset to $10,000");
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setResetBusy(false); }
  };
  const closePos = async (p) => {
    setCloseBusy(p.id);
    try {
      await authed(token, `/deployments/${p.deploymentId}/positions/${p.id}/close`, {});
      toast.success(`Closed ${p.side} ${p.symbol}`);
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setCloseBusy(""); }
  };
  return (
    <div className="mt-10" data-testid="paper-section">
      <div className="flex items-center gap-3">
        <h2 className="serif text-2xl font-light">Practice account</h2>
        <button onClick={reset} disabled={resetBusy} data-testid="paper-reset-btn"
          className="rounded-full border border-[#ffffff26] px-3 py-1 text-[11px] text-[#9aa0ae] hover:text-[#f4f4f5] disabled:opacity-40 transition-colors">
          {resetBusy ? "Resetting…" : "Reset to $10,000"}
        </button>
      </div>
      <Panel className="mt-4 p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Equity (pretend)</div>
            <div className="mt-1 text-2xl font-medium tnum" data-testid="paper-equity">{fmtUsd(paper.equityUsd)}</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">All-time PnL</div>
            <div className={`mt-1 text-2xl font-medium tnum ${pnl < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`} data-testid="paper-pnl">{fmtUsd(pnl)}</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Cash</div>
            <div className="mt-1 text-2xl font-medium tnum">{fmtUsd(paper.balanceUsd)}</div>
          </div>
        </div>
        {paper.positions?.length > 0 && (
          <div className="mt-4 border-t border-[#ffffff26] pt-3 space-y-2" data-testid="paper-positions">
            {paper.positions.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 text-[12px]">
                <Tag tone={p.side === "short" ? "short" : "long"}>{p.symbol}</Tag>
                <span className="text-[#9aa0ae]">{p.side} ${p.sizeUsd} · {p.leverage}×</span>
                <span className="mono tnum">entry {Number(p.entryPx).toLocaleString()}</span>
                <span className="mono text-[10px] text-[#9aa0ae]">{fmtAge(p.openedAt)}</span>
                <button onClick={() => closePos(p)} disabled={closeBusy === p.id} data-testid={`paper-close-${p.id}`}
                  className="ml-auto text-[11px] text-[#f43f5e] hover:underline disabled:opacity-40">
                  {closeBusy === p.id ? "Closing…" : "Close"}
                </button>
              </div>
            ))}
          </div>
        )}
        {paper.history?.length > 0 && (
          <div className="mt-4 border-t border-[#ffffff26] pt-3 space-y-2" data-testid="paper-history">
            <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Closed</div>
            {paper.history.slice(0, 8).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 text-[12px]">
                <Tag tone={p.side === "short" ? "short" : "long"}>{p.symbol}</Tag>
                <span className="text-[#9aa0ae]">{p.closeReason}</span>
                <span className={`mono tnum ${p.pnlUsd < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsd(p.pnlUsd)}</span>
                <span className="mono text-[10px] text-[#9aa0ae]">{fmtAge(p.closedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function AlertsPanel({ token, alerts, onDone }) {
  if (!alerts) return null;
  return (
    <div className="mt-10" data-testid="alerts-section">
      <div className="flex items-center gap-3">
        <h2 className="serif text-2xl font-light">Alerts</h2>
        {alerts.unread > 0 && (
          <button onClick={async () => { await authed(token, "/alerts/read", {}); onDone(); }} data-testid="alerts-mark-read"
            className="rounded-full border border-[#ffffff26] px-3 py-1 text-[11px] text-[#9aa0ae] hover:text-[#f4f4f5]">
            Mark all read ({alerts.unread})
          </button>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {alerts.alerts?.length === 0 && <Empty>No alerts yet. Deploy a strategy in alerts-only mode and it pings here.</Empty>}
        {alerts.alerts?.slice(0, 10).map((a, i) => (
          <Panel key={i} className={`p-4 text-[13px] ${a.read ? "opacity-60" : ""}`} data-testid={`alert-${i}`}>
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${a.read ? "bg-[#6b7280]" : "bg-[#f1f5f9]"}`} />
              <span>{a.message}</span>
              <span className="ml-auto mono text-[10px] text-[#9aa0ae]">{fmtAge(a.createdAt)}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function SolTradePanel({ token, onDone, selfSign = false, signTransaction = null }) {
  const [out, setOut] = useState(USDC);
  const [amount, setAmount] = useState(0.01);
  const [busy, setBusy] = useState(false);
  const trade = async () => {
    setBusy(true);
    try {
      if (selfSign) {
        if (!signTransaction) throw new Error("Connected wallet cannot sign transactions");
        const built = await authed(token, "/wallet/build_swap", { inputMint: WSOL, outputMint: out, amount: Math.round(amount * 1e9) });
        const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(built.swapTransaction), (c) => c.charCodeAt(0)));
        const signed = await signTransaction(tx);
        const d = await authed(token, "/wallet/send_signed", {
          signedTransaction: btoa(String.fromCharCode(...signed.serialize())),
          inputMint: WSOL, outputMint: out, amount: Math.round(amount * 1e9), outAmount: built.outAmount,
        });
        toast.success("Swap executed from your wallet", { description: `Signature ${short(d.signature, 8, 8)}` });
      } else {
        const d = await authed(token, "/wallet/trade", { inputMint: WSOL, outputMint: out, amount: Math.round(amount * 1e9) });
        toast.success("Trade executed on chain", { description: `Signature ${short(d.signature, 8, 8)}` });
      }
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  return (
    <Panel className="p-5" data-testid="sol-trade-panel">
      <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-wider text-[#9aa0ae]"><ArrowDownUp size={12} /> Swap on Solana · real{selfSign ? " · signed by your wallet" : ""}</div>
      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input type="number" min={0.001} step={0.001} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="h-11 w-32 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[13px] outline-none" data-testid="sol-trade-amount" />
          <span className="self-center mono text-[12px] text-[#9aa0ae]">SOL →</span>
          <select value={out} onChange={(e) => setOut(e.target.value)} data-testid="sol-trade-out"
            className="h-11 flex-1 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none">
            <option value={USDC}>USDC</option>
          </select>
        </div>
        <input value={out} onChange={(e) => setOut(e.target.value)} placeholder="or any SPL mint address"
          className="h-10 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[11px] outline-none" data-testid="sol-trade-mint" />
        <button onClick={trade} disabled={busy || amount <= 0} data-testid="sol-trade-btn"
          className="h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />} {selfSign ? "Build — sign in your wallet" : "Swap for real"}
        </button>
      </div>
    </Panel>
  );
}

function HlTradePanel({ token, markets, hlInfo, onDone }) {
  const [mktType, setMktType] = useState("perp");
  const [symbol, setSymbol] = useState("ETH");
  const [side, setSide] = useState("long");
  const [sizeUsd, setSizeUsd] = useState(25);
  const [lev, setLev] = useState(5);
  const [busy, setBusy] = useState(false);
  const [targetPx, setTargetPx] = useState("");
  const [direction, setDirection] = useState("below");
  const isSpot = mktType === "spot";
  const isLimit = mktType === "limit";
  const list = markets.filter((m) => !!m.spot === isSpot);
  const sel = list.find((m) => m.symbol === symbol) || list[0];
  const placeLimit = async () => {
    setBusy(true);
    try {
      await authed(token, "/hl/limit_order", { symbol: sel?.symbol || symbol, side, sizeUsd, leverage: lev, targetPrice: Number(targetPx), direction, mode: "live" });
      toast.success("Limit order set — the engine watches the price 24/7", {
        description: `${side === "long" ? "Long" : "Short"} ${sel?.symbol} when price ${direction === "above" ? "≥" : "≤"} $${Number(targetPx).toLocaleString()}` });
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const trade = async () => {
    setBusy(true);
    try {
      const d = await authed(token, "/hl/trade", { symbol: sel?.symbol || symbol, side, sizeUsd, leverage: lev, spot: isSpot });
      toast.success(
        isSpot ? `${side === "long" ? "Bought" : "Sold"} ${d.symbol} on Hyperliquid spot`
               : `${side === "long" ? "Long" : "Short"} opened on Hyperliquid`,
        { description: `${d.symbol} · $${sizeUsd}${isSpot ? "" : ` · ${lev}×`}` });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  const close = async (sym) => {
    try {
      await authed(token, "/hl/close", { symbol: sym });
      toast.success(`Closed ${sym}`);
      onDone();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Panel className="p-5" data-testid="hl-trade-panel">
      <div className="flex items-center gap-2">
        <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae] flex items-center gap-2"><ArrowUpRight size={12} /> Hyperliquid · real</div>
        <div className="ml-auto flex gap-1 rounded-full border border-[#ffffff26] p-0.5">
          {[["perp", "Perps"], ["spot", "Spot"], ["limit", "Limit"]].map(([k, l]) => (
            <button key={k} onClick={() => { setMktType(k); setSide("long"); }} data-testid={`hl-mkt-${k}`}
              className={`h-7 rounded-full px-3 text-[11px] transition-colors ${mktType === k ? "bg-[#f3f4f6] text-black" : "text-[#9aa0ae]"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {hlInfo && (
        <div className="mt-3 text-[11px]" data-testid="hl-balance-line">
          <span className="mono text-[#9aa0ae]">Balance <span className="text-[#f4f4f5]">{fmtUsd(hlInfo.equityUsd)}</span> · available <span className="text-[#f4f4f5]">{fmtUsd(hlInfo.withdrawableUsd)}</span></span>
          {hlInfo.equityUsd <= 0 && (
            <p className="mt-1.5 text-[#f43f5e]" data-testid="hl-unfunded-hint">Not funded yet — send USDC on Arbitrum to your Loom address above to activate real trading.</p>
          )}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <select value={sel?.symbol || ""} onChange={(e) => setSymbol(e.target.value)} data-testid="hl-symbol"  className="h-11 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none">
          {list.slice(0, 40).map((m) => <option key={m.symbol} value={m.symbol}>{m.label || m.symbol} · ${m.price < 1 ? Number(m.price).toPrecision(3) : m.price.toLocaleString()}</option>)}
        </select>
        <div className="flex gap-1 rounded-lg border border-[#ffffff26] p-1">
          {(isSpot ? [["long", "Buy"], ["short", "Sell"]] : [["long", "Long"], ["short", "Short"]]).map(([k, l]) => (
            <button key={k} onClick={() => setSide(k)} data-testid={`hl-side-${k}`}
              className={`flex-1 rounded-md text-[12px] font-medium transition-colors ${side === k ? (k === "long" ? "bg-[#10b981] text-white" : "bg-[#f43f5e] text-white") : "text-[#9aa0ae]"}`}>
              {l}
            </button>
          ))}
        </div>
        <input type="number" min={10} value={sizeUsd} onChange={(e) => setSizeUsd(Number(e.target.value) || 0)}
          className="h-11 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[13px] outline-none" data-testid="hl-size" />
        {isSpot ? (
          <div className="h-11 flex items-center px-3 mono text-[11px] text-[#9aa0ae] rounded-lg border border-[#ffffff1c]">USDC size · no leverage</div>
        ) : (
          <select value={lev} onChange={(e) => setLev(Number(e.target.value))} data-testid="hl-lev"
            className="h-11 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none">
            {[1, 2, 3, 5, 10, 20, 25, 40].map((l) => <option key={l} value={l}>{l}× leverage</option>)}
          </select>
        )}
      </div>
      {isLimit && (
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="hl-limit-row">
          <select value={direction} onChange={(e) => setDirection(e.target.value)} data-testid="hl-limit-dir"
            className="h-11 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none">
            <option value="below">When price drops to</option>
            <option value="above">When price rises to</option>
          </select>
          <input type="number" min={0} value={targetPx} onChange={(e) => setTargetPx(e.target.value)} placeholder={`now ${sel ? "$" + sel.price.toLocaleString() : ""}`}
            className="h-11 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[13px] outline-none" data-testid="hl-limit-price" />
        </div>
      )}
      {isLimit ? (
        <button onClick={placeLimit} disabled={busy || sizeUsd < 10 || !sel || !targetPx} data-testid="hl-trade-btn"
          className="mt-3 h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />}
          Set limit order · {side} ${sizeUsd} {direction === "above" ? "≥" : "≤"} ${targetPx || "…"}
        </button>
      ) : (
      <button onClick={trade} disabled={busy || sizeUsd < 10 || !sel || (hlInfo ? hlInfo.equityUsd <= 0 : false)} data-testid="hl-trade-btn"
        className="mt-3 h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin" />}
        {isSpot ? `${side === "long" ? "Buy" : "Sell"} ${sel?.symbol || ""} · $${sizeUsd}` : `Open ${side} · $${sizeUsd} · ${lev}×`}
      </button>
      )}
      {hlInfo?.positions?.length > 0 && (
        <div className="mt-4 border-t border-[#ffffff26] pt-3 space-y-2" data-testid="hl-positions">
          {hlInfo.positions.map((p) => (
            <div key={p.symbol} className="flex items-center gap-3 text-[12px]">
              <Tag tone={Number(p.size) < 0 ? "short" : "long"}>{p.symbol}</Tag>
              <span className="mono text-[#9aa0ae]">{p.size} @ {Number(p.entryPx).toLocaleString()}</span>
              <span className={`mono tnum ${Number(p.unrealizedPnl) < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsd(Number(p.unrealizedPnl))}</span>
              <button onClick={() => close(p.symbol)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#f43f5e] hover:underline" data-testid={`hl-close-${p.symbol}`}>
                <CircleX size={11} /> Close
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function WithdrawPanel({ token, hlInfo, onDone }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [hlTo, setHlTo] = useState("");
  const [hlAmount, setHlAmount] = useState("");
  const [hlDest, setHlDest] = useState("hl"); // hl = account-to-account | arb = bridge to Arbitrum
  const [busy, setBusy] = useState("");
  const solWithdraw = async () => {
    setBusy("sol");
    try {
      const d = await authed(token, "/wallet/withdraw", { to, amountSol: Number(amount) });
      toast.success("SOL sent", { description: short(d.signature, 8, 8) });
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const hlWithdraw = async () => {
    setBusy("hl");
    try {
      if (hlDest === "arb") {
        await authed(token, "/hl/withdraw_bridge", { amountUsd: Number(hlAmount) });
        toast.success("USDC sent to your address on Arbitrum", { description: "Allow a few minutes for the bridge" });
      } else {
        await authed(token, "/hl/withdraw", { destination: hlTo, amountUsd: Number(hlAmount) });
        toast.success("USDC sent on Hyperliquid");
      }
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="withdraw-panel">
      <Panel className="p-5">
        <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Withdraw SOL</div>
        <div className="mt-3 space-y-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Destination Solana address"
            className="h-10 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[11px] outline-none" data-testid="sol-withdraw-to" />
          <div className="flex gap-2">
            <input type="number" min={0.001} step={0.001} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (SOL)"
              className="h-10 w-32 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none" data-testid="sol-withdraw-amount" />
            <button onClick={solWithdraw} disabled={busy === "sol" || !to || !amount} data-testid="sol-withdraw-btn"
              className="h-10 flex-1 rounded-full border border-[#ffffff26] text-[12.5px] hover:border-[#f1f5f9] hover:text-[#cbd5e1] disabled:opacity-40 transition-colors">
              {busy === "sol" ? "Sending…" : "Send SOL"}
            </button>
          </div>
        </div>
      </Panel>
      <Panel className="p-5">
        <div className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Withdraw from Hyperliquid</div>
        <div className="mt-3 space-y-2">
          <div className="flex gap-1 rounded-full border border-[#ffffff26] p-0.5 w-fit">
            {[["hl", "To a Hyperliquid account"], ["arb", "To Arbitrum chain"]].map(([k, l]) => (
              <button key={k} onClick={() => setHlDest(k)} data-testid={`hl-dest-${k}`}
                className={`h-7 rounded-full px-3 text-[11px] transition-colors ${hlDest === k ? "bg-[#f3f4f6] text-black" : "text-[#9aa0ae]"}`}>
                {l}
              </button>
            ))}
          </div>
          {hlDest === "hl" ? (
            <input value={hlTo} onChange={(e) => setHlTo(e.target.value)} placeholder="Any Hyperliquid account address (0x…)"
              className="h-10 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[11px] outline-none" data-testid="hl-withdraw-to" />
          ) : (
            <p className="rounded-lg border border-[#ffffff1c] bg-[#17171b] px-3 py-2 text-[11px] text-[#9aa0ae]" data-testid="hl-bridge-note">
              Goes to your generated address on the Arbitrum network. Hyperliquid charges ~1 USDC.
            </p>
          )}
          <div className="flex gap-2">
            <input type="number" min={1} value={hlAmount} onChange={(e) => setHlAmount(e.target.value)} placeholder={`Amount (USDC) · up to ${hlInfo ? hlInfo.withdrawableUsd.toFixed(2) : "0"}`}
              className="h-10 w-44 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none" data-testid="hl-withdraw-amount" />
            <button onClick={hlWithdraw} disabled={busy === "hl" || (hlDest === "hl" && !hlTo) || !hlAmount} data-testid="hl-withdraw-btn"
              className="h-10 flex-1 rounded-full border border-[#ffffff26] text-[12.5px] hover:border-[#f1f5f9] hover:text-[#cbd5e1] disabled:opacity-40 transition-colors">
              {busy === "hl" ? "Sending…" : "Send USDC"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
